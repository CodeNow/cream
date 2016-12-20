'use strict'

const Promise = require('bluebird')

const logger = require('util/logger').child({ module: 'stripe' })
const keypather = require('keypather')()
const moment = require('moment')
const monitorDog = require('monitor-dog')

const DiscountService = require('services/discount-service')
const EntityExistsInStripeError = require('errors/entity-exists-error')
const EntityNotFoundError = require('errors/entity-not-found-error')
const StripeError = require('errors/stripe-error')
const stripeClient = require('util/stripe/client')

const StipreInvoiceUtils = require('util/stripe/invoice')
const StripeSubscriptionUtils = require('util/stripe/subscriptions')
const StripeErrorHandler = require('util/stripe/error-handler')

module.exports = class Stripe {

  /**
   * Create customer and subscription in Stripe. The plan assigned to the
   * organization is determined by the number of instances they currently have
   *
   * @param {Object}                      org              - Big Poppa organization. Presumes org is up to date.
   * @param {Number}                      org.id           - Big Poppa Id
   * @param {Number}                      org.githubId     - Github ID for organization
   * @param {Array<Object>}               org.users        - Array of all users in organization
   * @resolves {Object}                   res              - Response object
   * @resolves {Object}                   res.customer     - Stripe customer object
   * @resolves {Object}                   res.subscription - Stripe subscription object
   * @throws {EntityExistsInStripeError}                   - Will throw error if organization already has a StripeCustomerId
   * @returns {Promise}
   */
  static createCustomerAndSubscriptionForOrganization (org) {
    const log = logger.child({ org, method: 'createCustomerAndSubscriptionForOrganization' })
    log.info('Stripe.createCustomerAndSubscriptionForOrganization called')
    return Promise.try(function checkIfOrgIsAlreadyInStripe () {
      if (org.stripeCustomerId) {
        throw new EntityExistsInStripeError(
          `Organization with it ${org.id} already has stripeCustomerId`,
          { orgId: org.id, orgGithubId: org.githubId }
        )
      }
    })
      .then(function getPlanIdandCreateStripeCustomer () {
        return Promise.props({
          planId: StripeSubscriptionUtils.getPlanIdForOrganizationBasedOnCurrentUsage(org.githubId),
          stripeCustomer: Stripe._createCustomer(org)
        })
      })
      .then(function createSubscriptionForCustomer (res) {
        log.trace({ planId: res.planId, users: org.users }, 'createSubscriptionForCustomer')
        return StripeSubscriptionUtils.createSubscription(res.stripeCustomer.id, org.users, res.planId)
          .then(function (stripeSubscription) {
            return {
              customer: res.stripeCustomer,
              subscription: stripeSubscription
            }
          })
      })
  }

  /**
   * Update payment method for organization and set the payment-method owner
   *
   * @param {Object}   org                        - Organization object
   * @param {String}   stripeToken                - Stripe token for payment method
   * @param {Object}   user                       - User object
   * @param {Number}   user.id                    - User ID
   * @param {Number}   user.githubId              - User Github ID
   * @param {Number}   newPaymentMethodOwnerEmail - Email address for user
   * @returns {Promise}
   */
  static updatePaymentMethodForOrganization (org, stripeToken, user, newPaymentMethodOwnerEmail) {
    const log = logger.child({ org: org, stripeToken: stripeToken, user: user })
    log.info('Stripe.updatePaymentMethodForOrganization called')
    return Promise.try(() => {
      if (!org.stripeCustomerId) {
        throw new EntityNotFoundError(
          'Customer has no `stripeCustomerId`',
          { org: org }
        )
      }
      let updates = {
        source: stripeToken,
        email: newPaymentMethodOwnerEmail,
        metadata: {
          paymentMethodOwnerId: user.id,
          paymentMethodOwnerGithubId: user.githubId
        }
      }
      log.trace({ updates: updates }, 'Update Stripe customer')
      return stripeClient.customers.update(org.stripeCustomerId, updates)
    })
      .catch(StripeErrorHandler)
  }

 /**
   * Get payment method and payment method owner for an organization
   *
   * @param {String}     stripeCustomerId - Organization id
   * @resolves {Object}  res              - Response object
   * @return {Promise}
   */
  static getCustomer (orgStripeCustomerId) {
    const log = logger.child({ orgStripeCustomerId: orgStripeCustomerId })
    log.info('getCustomer called')
    return Promise.try(() => {
      if (!orgStripeCustomerId) {
        log.warn('No `stripeCustomerId` provided')
        throw new EntityNotFoundError(
          'Customer has no `stripeCustomerId`',
          { orgStripeCustomerId: orgStripeCustomerId }
        )
      }
      return stripeClient.customers.retrieve(orgStripeCustomerId)
    })
  }

  /**
   * Create a customer in Stripe
   *
   * @param {Object}     org            - Big Poppa organization. Presumes org is up - to - date.
   * @param {Number}     org.id         - Big Poppa Id
   * @param {Number}     org.githubId   - Github ID for organization
   * @resolves {Object}  stipreCustomer - Stripe customer object
   * @returns {Promise}
   */
  static _createCustomer (org) {
    const log = logger.child({ org: org }, 'Stripe._createCustomer')
    log.info('Stripe._createCustomer called')
    const updates = {
      description: `${org.name} ( organizationId: ${org.id}, githubId: ${org.githubId} )`,
      metadata: {
        organizationId: org.id,
        githubId: org.githubId
      }
    }
    const coupon = DiscountService.getCouponAtSignUpTime(org)
    if (coupon) {
      log.trace({ coupon: coupon }, 'Found discount for customer')
      updates.coupon = coupon
    }
    log.trace({ updates: updates }, 'Creating customer in Stripe')
    return stripeClient.customers.create(updates)
      .then(function validateCreatedCustomer (stripeCustomer) {
        if (!stripeCustomer || !stripeCustomer.id) {
          throw new StripeError(
            'Newly created customer does not have a stripeCustomer',
            { stripeCustomer: stripeCustomer }
          )
        }
        return stripeCustomer
      })
  }

   /**
   * Retrieve an Event from oStripe
   *
   * @param {String}     eventId - ID for Stripe Event
   * @resolves {Object}  event   - Stripe event object
   * @returns {Promise}
   */
  static getEvent (eventId) {
    const log = logger.child({ eventId: eventId }, 'Stripe.getEvent')
    log.info('Stripe.getEvent called')
    const timer = monitorDog.timer('Stripe.getEvent', true)
    return stripeClient.events.retrieve(eventId)
    .catch(StripeErrorHandler)
    .finally(() => timer.stop())
  }

  /**
   * Retrieve Plan by its ID
   *
   * @param {String}     planId - ID for Stripe plan (Should be part of `PLANS`)
   * @resolves {Object}  plan   - Stripe object with plan
   * @returns {Promise}
   */
  static getPlan (planId) {
    const log = logger.child({ planId: planId }, 'Stripe.getPlan')
    log.info('Stripe.getPlan called')
    return stripeClient.plans.retrieve(planId)
      .then(function (stripePlan) {
        log.trace('Plan retrieved')
        return {
          id: planId,
          price: stripePlan.amount,
          maxConfigurations: StripeSubscriptionUtils.PLANS[planId]
        }
      })
  }

  /**
   * Get all invoices for a Stripe Customer
   *
   * @param {String}            stripeCustomerId - Stripe customer ID for Big Poppa organization
   * @resolves {Array<Object>}  invoices         - Array of invoices
   * @returns {Promise}
   */
  static getInvoicesForOrg (orgStripeCustomerId) {
    const log = logger.child({ orgStripeCustomerId: orgStripeCustomerId }, 'Stripe.getInvoicesForOrg')
    log.info('Stripe.getInvoicesForOrg called')
    return Promise.try(() => {
      if (!orgStripeCustomerId) {
        log.warn('No `stripeCustomerId` provided')
        throw new EntityNotFoundError(
          'Customer has no `stripeCustomerId`',
          { orgStripeCustomerId: orgStripeCustomerId }
        )
      }
      return stripeClient.invoices.list(
        // 100 is the limit imposed by the Stripe API
        { limit: 100, customer: orgStripeCustomerId }
      )
    })
  }

  /**
   * Retrieve Customer discount
   *
   * @param {String}    stripeCustomerId - Stripe customer ID for Big Poppa organization
   * @resolves {Object} discount - Discount object
   * @returns {Promise}
   */
  static getDiscount (orgStripeCustomerId) {
    const log = logger.child({ stripeCustomerId: orgStripeCustomerId }, 'Stripe.getDiscount')
    log.info('Stripe.getDiscount called')
    return Stripe.getCustomer(orgStripeCustomerId)
      .then(function (stripeCustomer) {
        log.trace('Customer retrieved')
        if (!stripeCustomer.discount) return null
        let discount = stripeCustomer.discount
        let metadata = keypather.get(discount, 'coupon.metadata')
        return {
          end: moment(discount.end, 'X').toISOString(),
          start: moment(discount.start, 'X').toISOString(),
          coupon: {
            amountOff: keypather.get(discount, 'coupon.amount_off'),
            duration: keypather.get(discount, 'coupon.duration'),
            durationInMonths: keypather.get(discount, 'coupon.duration_in_months'),
            percentOff: keypather.get(discount, 'coupon.percent_off'),
            valid: keypather.get(discount, 'coupon.valid'),
            metadata: metadata
          }
        }
      })
  }

  /**
   * Retrieve payment method owner for organization
   *
   * @param {String}                 stripeCustomerId   - Stripe customer ID for Big Poppa organization
   * @resolves {Object}              paymentMethodOwner - Payment method owner object
   * @throws {EntityNotFoundError}                      - Thrown if no paymentMethodOwner found
   * @throws {EntityNotFoundError}                      - Thrown if paymentMethodOwner cannot be parsed as an number
   * @returns {Promise}
   */
  static getCustomerPaymentMethodOwner (orgStripeCustomerId) {
    const log = logger.child({ orgStripeCustomerId }, 'Stripe.getDiscount')
    log.info('Stripe.getDiscount called')
    return Stripe.getCustomer(orgStripeCustomerId)
      .then(function (stripeCustomer) {
        log.trace({ stripeCustomer }, 'Customer retrieved')
        const paymentMethodOwnerId = parseInt(keypather.get(stripeCustomer, 'metadata.paymentMethodOwnerId'), 10)
        const paymentMethodOwnerGithubId = parseInt(keypather.get(stripeCustomer, 'metadata.paymentMethodOwnerGithubId'), 10)
        log.trace({ paymentMethodOwnerId, paymentMethodOwnerGithubId }, 'PaymnetMethodOwner ids')
        if (!paymentMethodOwnerId) {
          throw new EntityNotFoundError('No `paymentMethodOwnerId` found for this org', { orgStripeCustomerId })
        }
        if (!paymentMethodOwnerGithubId) {
          throw new EntityNotFoundError('No `paymentMethodOwnerGithubId` found for this org', { orgStripeCustomerId })
        }
        return { id: paymentMethodOwnerId, githubId: paymentMethodOwnerGithubId }
      })
  }

  /**
   *
   * @param {Object}                      org              - Big Poppa organization. Presumes org is up to date.
   * @param {Number}                      org.id           - Big Poppa Id
   * @param {Number}                      org.githubId     - Github ID for organization
   * @param {Array<Object>}               org.users        - Array of all users in organization
   * @resolves {Object}                   subscription     - Stripe subscription object
   * @throws {EntityExistsInStripeError}                   - Will throw error if organization already has a StripeCustomerId
   * @returns {Promise}
   */
  static createNewSubscriptionForCustomerWithPaymentMethod (org) {
    const log = logger.child({ org })
    log.info('Stripe.createSubscripttionForCustomerWithPaymentMethod called')
    return StripeSubscriptionUtils.getPlanIdForOrganizationBasedOnCurrentUsage(org.githubId)
    .then(function createSubscriptionForCustomer (plan) {
      log.trace({ plan }, 'Create new subscipriton for customer')
      return StripeSubscriptionUtils.createSubscription(org.stripeCustomerId, org.users, plan, { noTrial: true })
    })
  }
}

module.exports.invoices = StipreInvoiceUtils
module.exports.subscriptions = StripeSubscriptionUtils
module.exports.stripeClient = stripeClient
