'use strict'

const Promise = require('bluebird')
const express = require('express')
const Joi = Promise.promisifyAll(require('joi'))

const BaseRouter = require('http/routes/base')

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
   * Get current Stripe plan for an organization. This should also return any
   * discounts the organization current has.
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
   * Get the current plan for an organization
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
   * @param {Object}    validatedReq                         - Validated request against `getSchema`
   * @param {Object}    validatedReq.params                  - Request query object
   * @param {Number}    validatedReq.params.id               - Organization ID (big                  - poppa)
   * @param {Object}    validatedReq.body
   * @param {String}    validatedReq.body.paymentMethodToken - Stripe token for new payment method
   * @return {Promise}
   */
  static postPaymentMethod (validatedReq, res) {
    return Promise.resolve()
      .then(() => res.status(501).send('Not yet implemented'))
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
    paymentMethodToken: Joi.string().required()
  }).unknown().required()
}).unknown()

module.exports = OrganizationRouter
