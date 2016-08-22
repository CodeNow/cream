'use strict'

const Promise = require('bluebird')
const express = require('express')
const Joi = Promise.promisifyAll(require('joi'))
const moment = require('moment')
const keypather = require('keypather')()

const logger = require('util/logger').child({ module: 'OrganizationRouter' })
const stripe = require('util/stripe')
const util = require('util/index')
const bigPoppa = require('util/big-poppa')
const _ = require('lodash')

const BaseRouter = require('http/routes/base')
const UserNotPartOfOrganizationError = require('errors/validation-error')

class OrganizationRouter extends BaseRouter {

  /**
   * Generate an express router based on the router class
   *
   * @returns {Object} - An newly generated express router
   */
  static router () {
    const router = express.Router()
    router.get('/:id/invoices/', OrganizationRouter.createRoute(OrganizationRouter.getInvoices, OrganizationRouter.getSchema))
    router.get('/:id/plan/', OrganizationRouter.createRoute(OrganizationRouter.getPlan, OrganizationRouter.getSchema))
    router.get('/:id/payment-method/', OrganizationRouter.createRoute(OrganizationRouter.getPaymentMethod, OrganizationRouter.getSchema))
    router.post('/:id/payment-method/', OrganizationRouter.createRoute(OrganizationRouter.postPaymentMethod, OrganizationRouter.postPlanSchema))
    return router
  }

  /**
   * Parse owner from object returned by Stripe
   *
   * @param {Object} stripeObject
   * @param {Object} stripeObject.metadata
   * @param {String} stripeObject.metadata.paymentMethodOwnerId
   * @param {String} stripeObject.metadata.paymentMethodOwnerGithubId
   * @resolves {Promise}
   * @returns {Promise}
   */
  static _parseOwnerMetadata (stripeObject) {
    return {
      // Metadata is always saved as strings
      id: parseInt(keypather.get(stripeObject, 'metadata.paymentMethodOwnerId'), 10),
      githubId: parseInt(keypather.get(stripeObject, 'metadata.paymentMethodOwnerGithubId'), 10)
    }
  }

  /**
   * Get all invoices for an organization.
   *
   * Invoices should have the following information
   * - Amount ($299.70)
   * - User who paid (Big-poppa user)
   * - Date (ISO8601 timestamp for when invoice was paid)
   *
   * @param {Object}            validatedReq           - Validated request against `getSchema`
   * @param {Object}            validatedReq.params    - Request parameters
   * @param {Number}            validatedReq.params.id - Organization ID (in big-poppa)
   * @return {Promise}
   * @resolves {Array<Object>}
   */
  static getInvoices (validatedReq, res) {
    const log = logger.child({ validatedReq: validatedReq })
    log.info('getInvoices called')
    return bigPoppa.getOrganization(validatedReq.params.id)
      .then(function fetchPaymentMethod (org) {
        log.trace({ org: org }, 'Fetch Stripe customer')
        return stripe.getInvoicesForOrg(org.stripeCustomerId)
      })
      .then(function parseInvoices (response) {
        log.trace({ response: response }, 'Parse invoices received from Stripe')
        if (!Array.isArray(response.data)) {
          return []
        }
        return response.data.map(invoice => {
          // Convert to camelCase and extend with `paidBy`
          invoice = util.convertObjectToCamelCase(Object.assign({}, invoice, {
            paidBy: OrganizationRouter._parseOwnerMetadata(invoice)
          }))
          // Add only needed properties
          invoice = _.pick(invoice, ['amountDue', 'discount', 'paidBy', 'periodEnd', 'periodStart', 'date', 'total', 'paid', 'closed', 'metadata'])
          // Change UNIX timestamps to ISO strings
          invoice = Object.assign(invoice, {
            periodEnd: moment(invoice.periodEnd, 'X').toISOString(),
            periodStart: moment(invoice.periodStart, 'X').toISOString(),
            date: moment(invoice.date, 'X').toISOString()
          })
          return invoice
        })
      })
      .then(function respondToRequest (invoices) {
        return res.status(200).json({ invoices: invoices })
      })
  }

  /**
   * Get current Stripe plan for organization (the one they're currently getting
   * filled for `current`) and current plan organization would get based on current number
   * of instances (`next`). This should also return any discounts the organization
   * current has.
   *
   * Response should be formatted:
   * - current
   *   - plan
   *    - id
   *    - max number of instances for plan
   *    - price (monthly/per-user)
   *    - users in plan
   * - next
   *   - plan
   *    - id
   *    - max number of instances for plan
   *    - price (monthly/per-user)
   *    - users in plan
   *
   * @param {Object}     validatedReq           - Validated request against `getSchema`
   * @param {Object}     validatedReq.params    - Request parameters
   * @param {Number}     validatedReq.params.id - Organization ID (in big-poppa)
   * @return {Promise}
   * @resolves {Object}
   */
  static getPlan (validatedReq, res) {
    const log = logger.child({ validatedReq: validatedReq })
    log.info('getPlan called')
    return bigPoppa.getOrganization(validatedReq.params.id)
      .then(function getCurrentPlans (org) {
        return Promise.all([
          stripe._getSubscriptionForOrganization(org.stripeCustomerId),
          stripe.getPlanIdForOrganizationBasedOnCurrentUsage(org.githubId),
          org
        ])
      })
      .spread(function fetchStripePlans (currentSubscription, planIdForNextPlan, org) {
        log.trace({ currentSubscription: currentSubscription, planIdForNextPlan }, 'Subscription and planId fetched')
        return Promise.all([
          stripe.getPlan(currentSubscription.plan.id),
          stripe.getPlan(planIdForNextPlan),
          stripe.getDiscount(org.stripeCustomerId),
          currentSubscription,
          org
        ])
      })
      .spread(function (currentPlan, nextPlan, discount, currentSubscription, org) {
        log.trace({ currentPlan: currentPlan, nextPlan: nextPlan }, 'Stripe plans fetched')
        let currentNumberOfUsers = null
        if (keypather.get(currentSubscription, 'metadata.users')) {
          let users = JSON.parse(currentSubscription.metadata.users)
          currentNumberOfUsers = users.length
        }
        let plans = {
          discount: discount,
          current: Object.assign({},
            currentPlan,
            { userCount: currentNumberOfUsers }
          ),
          next: Object.assign({},
            nextPlan,
            { userCount: stripe.generatePlanUsersForOrganization(org.users).length }
          )
        }
        log.trace({ plans: plans }, 'Plans Object')
        return res.status(200).json(plans)
      })
  }

  /**
   * Get the current payment method for an organization
   *
   * @param {Object}     validatedReq           - Validated request against `getSchema`
   * @param {Object}     validatedReq.params    - Request parameters
   * @param {Number}     validatedReq.params.id - Organization ID (in big-poppa)
   * @return {Promise}
   * @resolves {Object}
   */
  static getPaymentMethod (validatedReq, res) {
    const log = logger.child({ validatedReq: validatedReq })
    log.info('getPaymentMethod called')
    return bigPoppa.getOrganization(validatedReq.params.id)
      .then(function fetchPaymentMethod (org) {
        log.trace({ org: org }, 'fetch Stripe customer')
        return stripe.getCustomer(org.stripeCustomerId)
      })
      .then(function formatResponse (customer) {
        log.trace({ customer: customer }, 'Customer object fetched')

        let sources = keypather.get(customer, 'sources.data')
        if (!Array.isArray(sources)) return null

        let paymentMethod = sources.filter(x => x.object === 'card')[0]
        if (!paymentMethod) return null

        // Remove potentially sensitive information
        delete paymentMethod.customer
        delete paymentMethod.id
        return {
          // Stripe always stores all metadata as strings
          owner: OrganizationRouter._parseOwnerMetadata(customer),
          // Currently, we only have credit cards as payment methods
          card: util.convertObjectToCamelCase(paymentMethod)
        }
      })
      .then(obj => {
        if (!obj) {
          return res.status(404).send('No payment method found for user')
        }
        return res.status(200).json(obj)
      })
  }

  /**
   * Change the current payment method for an organization
   *
   * @param {Object}    validatedReq                  - Validated request against `getSchema`
   * @param {Object}    validatedReq.params           - Request query object
   * @param {Number}    validatedReq.params.id        - Organization ID (big poppa)
   * @param {Object}    validatedReq.body             - Body Object
   * @param {String}    validatedReq.body.stripeToken - Stripe Token for new payment method
   * @param {Object}    validatedReq.body.user        - Big poppa user object
   * @param {String}    validatedReq.body.user.id     - ID for Big poppa user
   * @return {Promise}
   */
  static postPaymentMethod (validatedReq, res) {
    const log = logger.child({ validatedReq: validatedReq })
    log.info('postPaymentMethod called')
    return bigPoppa.getOrganization(validatedReq.params.id)
      .then(function updatePlanForOrg (org) {
        log.trace({ org: org }, 'Organization fetched')
        let user = org.users.find(user => user.id === validatedReq.body.user.id)
        if (!user) {
          throw new UserNotPartOfOrganizationError('Organization does not have user with provided user id')
        }
        return stripe.updatePaymentMethodForOrganization(org, validatedReq.body.stripeToken, user)
      })
      .then(function updateHasPaymentMethod () {
        return bigPoppa.updateOrganization(validatedReq.params.id, {
          hasPaymentMethod: true
        })
      })
      .then(() => {
        return res.status(201).send('Successfully updated')
      })
  }
}

OrganizationRouter.getSchema = Joi.object({
  params: Joi.object({
    id: Joi.number().required()
  }).required()
}).unknown().required().label('OrganizationRouter.get')

OrganizationRouter.postPlanSchema = Joi.object({
  params: Joi.object({
    id: Joi.number().required()
  }).required(),
  body: Joi.object({
    stripeToken: Joi.string().required(),
    user: Joi.object({
      id: Joi.number().required()
    }).required()
  }).unknown().required()
}).unknown().required().label('OrganizationRouter.post')

module.exports = OrganizationRouter
