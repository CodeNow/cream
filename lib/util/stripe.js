'use strict'

const Promise = require('bluebird')
const stripeClient = require('stripe')(process.env.STRIPE_API_KEY)

const logger = require('util/logger').child({ module: 'stripe' })
const runnableAPI = require('util/runnable-api-client')

const EntityExistsInStripeError = require('errors/entity-exists-error')
const EntityNotFoundError = require('errors/entity-not-found-error')
const StripeError = require('errors/stripe-error')

const MINIMUM_NUMBER_OF_USERS_IN_PLAN = 3

/**
 * These plan are stored in Stripe, but Stripe plans how no knowledge of
 * how many configurations a plan can have
 *
 * This is the source of truth for the max number of configurations. Not Stripe.
 *
 * @param {String} key   - Plan id in Stripe
 * @param {Number} value - Maximum number of configurations allowed per plan
 */
const PLANS = {
  'runnable-basic': 2,
  'runnable-standard': 7,
  'runnable-plus': 99999
}

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
    const log = logger.child({ org: org })
    log.info('Stripe.createCustomer called')
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
          planId: Stripe.getPlanIdForOrganizationBasedOnCurrentUsage(org.githubId),
          stripeCustomer: Stripe._createCustomer(org)
        })
      })
      .then(function createSubscriptionForCustomer (res) {
        log.trace({ planId: res.planId, users: org.users }, 'createSubscriptionForCustomer')
        return Stripe._createSubscription(res.stripeCustomer.id, org.users, res.planId)
          .then(function (stripeSubscription) {
            return {
              customer: res.stripeCustomer,
              subscription: stripeSubscription
            }
          })
      })
  }

  /**
   * Update the number of users in a plan for an organization. Also updates
   * the metadata object in the plan to reflect who those users are.
   *
   * @param {Object}         org                  - Big Poppa organization. Presumes org is up-to-date.
   * @param {Number}         org.stripeCustomerId - Stripe customer ID for organization
   * @param {Array<Object>}  org.users            - Array of all users in organization
   * @resolves {Object}      subscription         - Subscription object returned by Stripe
   * @returns {Promise}
   */
  static updateUsersForPlan (org) {
    const log = logger.child({ org: org })
    log.info('Stripe.updateUsersInPlan called')
    return Stripe._getSubscriptionForOrganization(org.stripeCustomerId)
      .then(function updateCustomerInStripe (subscription) {
        log.trace({ subscription: subscription }, 'updateCustomerInStripe')
        return Stripe._updateUsersForPlan(subscription.id, org.users)
      })
  }

  /**
   * Update plan ID for organization, based on current usage. Fetches number
   * of instances using the Runnable API Client and determines the current
   * plan based on that.
   *
   * @param {Object}     org - Organization object
   * @returns {Promise}
   */
  static updatePlanIdForOrganizationBasedOnCurrentUsage (org) {
    const log = logger.child({ org: org })
    log.info('Stripe.updatePlanIdForOrganizationBasedOnCurrentUsage called')
    return Promise.all([
      Stripe._getSubscriptionForOrganization(org.stripeCustomerId),
      Stripe.getPlanIdForOrganizationBasedOnCurrentUsage(org.githubId)
    ])
      .spread(function updateCustomerInStripe (subscription, planId) {
        log.trace({ subscription: subscription, planId: planId }, 'fetched customer and planId')
        return stripeClient.subscriptions.update(
          subscription.id,
          { plan: planId }
        )
      })
  }

  /**
   * Update payment method for organization and set the payment-method owner
   *
   * @param {Object}     org           - Organization object
   * @param {String}     stripeToken   - Stripe token for payment method
   * @param {Object}     user          - User object
   * @param {Number}     user.id       - User ID
   * @param {Number}     user.githubId - User Github ID
   * @returns {Promise}
   */
  static updatePaymentMethodForOrganization (org, stripeToken, user) {
    const log = logger.child({ org: org, stripeToken: stripeToken, user: user })
    log.info('Stripe.updatePaymentMethodForOrganization called')
    return Promise.try(() => {
      if (!org.stripeCustomerId) {
        throw new EntityNotFoundError('Customer has no `stripeCustomerId`')
      }
      let updates = {
        source: stripeToken,
        metadata: {
          paymentMethodOwnerId: user.id,
          paymentMethodOwnerGithubId: user.githubId
        }
      }
      log.trace({ updates: updates }, 'Update Stripe customer')
      return stripeClient.customers.update(org.stripeCustomerId, updates)
    })
  }

  /**
   * Add payment-method owner to the invoice. This facilitates knowing what
   * user actually paid the invoice
   *
   * @param {Object}     org                  - Organization object
   * @param {String}     org.stripeCustomerId - Customer ID in Stripe
   * @param {String}     invoiceId            - Stripe invoice ID
   * @returns {Promise}
   */
  static updateInvoiceWithPaymentMethodOwner (org, invoiceId) {
    const log = logger.child({ org: org, invoiceId: invoiceId })
    log.info('Stripe.updateInvoiceWithPaymentMethodOwner called')
    return stripeClient.customers.retrieve(org.stripeCustomerId)
      .then(function updateInvoice (customer) {
        return Stripe._updateInvoiceMetadata(invoiceId, customer)
      })
  }

  /**
   * Update metadata in invoice. Given a customer, update the metadata for
   * `paymentMethodOwnerId` and `paymentMethodOwnerGithubId`
   *
   * @param {String}     invoiceId - Stripe invoice ID
   * @param {Object}     customer  - Stripe customer object
   * @resolves {Object}  invoice   - Stripe Invoice object
   * @returns {Promise}
   */
  static _updateInvoiceMetadata (invoiceId, customer) {
    const log = logger.child({ invoiceId: invoiceId, customerMetadata: customer.metadata })
    log.info('Stripe._updateInvoiceMetadata called')
    let metatdataUpdates = {
      paymentMethodOwnerId: customer.metadata.paymentMethodOwnerId,
      paymentMethodOwnerGithubId: customer.metadata.paymentMethodOwnerGithubId
    }
    log.trace({ metatdataUpdates: metatdataUpdates, customer: customer }, 'updates to invoice')
    return stripeClient.invoices.update(invoiceId, {
      metadata: metatdataUpdates
    })
  }

  /**
   * Determine which plan an organization would have based on current number of
   * instances (queried through API)
   *
   * @param {Number}     orgGithubId - Organization Github ID
   * @resolves {String}  planId      - Name of Stripe plan
   * @returns {Promise}
   */
  static getPlanIdForOrganizationBasedOnCurrentUsage (orgGithubId) {
    const log = logger.child({ orgGithubId: orgGithubId })
    log.info('getPlanIdForOrganizationBasedOnCurrentUsage called')
    return runnableAPI.getAllInstancesForUserByGithubId(orgGithubId)
      .then(function determinePlan (instances) {
        let numberOfInstances = instances.length
        log.trace({ instances: numberOfInstances }, 'Fetched instances')
        // Sort plan by the number of instances allowed in each plan
        // (Object keys do not guarantee order)
        let planNames = Object.keys(PLANS).sort(function sortByNumberOfInstances (a, b) {
          return PLANS[a] - PLANS[b]
        })
        // Find the first plan where the number of instances is less or equal
        // to the number of instances allowed in that plan
        let selectedPlanName = planNames.find(function findPlanName (planName) {
          return numberOfInstances <= PLANS[planName]
        })
        log.trace({ selectedPlanName: selectedPlanName }, 'selectedPlanName')
        return selectedPlanName
      })
  }

  /**
   * Get subscription for organization
   *
   * @param {String}     orgStripeCustomerId - Stripe Customer ID
   * @resolves {Object}  subscription        - Stripe subscription object
   * @returns {Promise}
   */
  static _getSubscriptionForOrganization (orgStripeCustomerId) {
    const log = logger.child({ orgStripeCustomerId: orgStripeCustomerId })
    log.info('_getSubscriptionForOrganization called')
    return stripeClient.subscriptions.list({ limit: 1, customer: orgStripeCustomerId })
      .then(res => {
        let subscriptions = res.data
        log.trace({ subscriptions: subscriptions }, 'Subscriptions received from Stripe')
        if (subscriptions.length === 0) {
          throw new EntityNotFoundError('No subscription found for organization')
        }
        return subscriptions[0]
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
    return stripeClient.customers.create({
      description: `Customer for organizationId: ${org.id} / githubId: ${org.githubId}`,
      metadata: {
        organizationId: org.id,
        githubId: org.githubId
      }
    })
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
   * Create subscription in Stripe
   *
   * @param {String}         stripeCustomerId - Stripe customer ID for Big Poppa organization
   * @param {Array<Object>}  users            - Array of all users in organization
   * @param {String}         planId           - ID for Stripe plan (Should be part of `PLANS`)
   * @resolves {Object}      subscription     - Stripe subscription object
   * @returns {Promise}
   */
  static _createSubscription (stripeCustomerId, users, planId) {
    const log = logger.child({ stripeCustomerId: stripeCustomerId, users: users, planId: planId }, 'Stripe._createSubscription')
    log.info('Stripe._createSubscription called')
    let createObject = Object.assign({
      customer: stripeCustomerId,
      plan: planId
    }, Stripe._getUpdateObjectForUsers(users))
    log.trace({ createObject: createObject }, 'Creating subscription')
    return stripeClient.subscriptions.create(createObject)
  }

  /**
   * Update users in Plan for Stripe
   *
   * @param {String}         subscriptionId - Stripe Customer ID
   * @param {Array<Object>}  planUsers      - Array of Big poppa users
   * @resolves {Object}      subscription   - Stripe subscription object
   * @returns {Promise}
   */
  static _updateUsersForPlan (subscriptionId, planUsers) {
    const log = logger.child({ subscriptionId: subscriptionId, planUsers: planUsers }, 'Stripe._updateUsersForPlan')
    log.info('_updateUsersForPlan called')
    return stripeClient.subscriptions.update(
      subscriptionId,
      Stripe._getUpdateObjectForUsers(planUsers)
    )
  }

  /**
   * Create an object to be passed to the Stripe API in order to populate the
   * number of users and metadata about users in plan
   *
   * @param {Array<Object>}  users             - Array of Big Poppa users
   * @param {Array<Object>}  users[0].githubId - Github id for users
   * @returns {Object}
   */
  static _getUpdateObjectForUsers (users) {
    let planUsers = Stripe._generatePlanUsersForOrganization(users)
    return {
      quantity: planUsers.length,
      metadata: {
        // Must be a string under 500 characters
        // Stores Github IDs for approximately first 50 users
        users: JSON.stringify(planUsers).substring(0, 499)
      }
    }
  }

  /**
   * Generate array to be passed to Stripe API from array of Big Poppa users
   *
   * @param {Array<Object>}           users - Array of Big poppa users
   * @returns {Array<String|Number>}        - Array of Github IDs or String
   */
  static _generatePlanUsersForOrganization (users) {
    const log = logger.child({ users: users }, '_generatePlanUsersForOrganization')
    log.info('_generatePlanUsersForOrganization called')
    let minAmountOfUsers = Math.max(users.length, MINIMUM_NUMBER_OF_USERS_IN_PLAN)
    log.trace({ minAmountOfUsers: minAmountOfUsers }, 'Minimum number of users')
    let planUsers = []
    for (var i = 0; i < minAmountOfUsers; i++) {
      let userGithubId = users[i] && users[i].githubId
      if (userGithubId) {
        planUsers.push(userGithubId)
      } else {
        planUsers.push('ADDED_USER_TO_MEET_MINIMUM')
      }
    }
    log.trace({ planUsers: planUsers }, 'Users set in plan')
    return planUsers
  }

  /**
   * Retrieve an Event from oStripe
   *
   * @param {Number}     eventId - ID for Stripe Event
   * @resolves {Object}  event   - Stripe event object
   * @returns {Promise}
   */
  static getEvent (eventId) {
    const log = logger.child({ eventId: eventId }, 'Stripe.getEvent')
    log.info('Stripe.getEvent called')
    return stripeClient.events.retrieve(eventId)
  }
}

module.exports.stripeClient = stripeClient
