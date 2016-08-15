'use strict'

const Promise = require('bluebird')
const express = require('express')
const Joi = Promise.promisifyAll(require('joi'))

const logger = require('util/logger').child({ module: 'OrganizationRouter' })
const stripe = require('util/stripe')
const bigPoppa = require('util/big-poppa')

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
    return Promise.resolve()
      .then(() => res.status(501).send('Not yet implemented'))
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
    return Promise.resolve()
      .then(() => res.status(501).send('Not yet implemented'))
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
    return Promise.resolve()
      .then(() => res.status(501).send('Not yet implemented'))
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
        return res.status(201).send('Succsefully updated')
      })
  }
}

OrganizationRouter.getSchema = Joi.object({
  params: Joi.object({
    id: Joi.number().required()
  }).required()
}).unknown()

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
}).unknown()

module.exports = OrganizationRouter
