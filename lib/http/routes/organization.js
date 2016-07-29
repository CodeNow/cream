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
   * - Date (UNIX timestamp for when invoice was paid)
   *
   * @param {Object}          validatedReq           - Validated request against `getSchema`
   * @param {Object}          validatedReq.params    - Request parameters
   * @param {Number}          validatedReq.params.id - Organization ID (in big-poppa)
   * @return {Promise}
   * @resolves {Array<Object>}
   */
  static getInvoices (validatedReq, res) {
    return res.status(501).send('Not yet implented')
  }

  /**
   * Get current Stripe plan for an organization. This should also return any
   * discounts the organization current has.
   *
   * @param {Object}          validatedReq           - Validated request against `getSchema`
   * @param {Object}          validatedReq.params    - Request parameters
   * @param {Number}          validatedReq.params.id - Organization ID (in big-poppa)
   * @return {Promise}
   * @resolves {Object}
   */
  static getPlan (validatedReq, res) {
    return res.status(501).send('Not yet implented')
  }

  /**
   * Get the current plan for an organization
   *
   * @param {Object}          validatedReq           - Validated request against `getSchema`
   * @param {Object}          validatedReq.params    - Request parameters
   * @param {Number}          validatedReq.params.id - Organization ID (in big-poppa)
   * @return {Promise}
   * @resolves {Object}
   */
  static getPaymentMethod (validatedReq, res) {
    return res.status(501).send('Not yet implented')
  }

  /**
   * Process Stripe webhooks and enqueue a job if it's something we care about
   *
   * @param {Object}          validatedReq          - Validated request against `getSchema`
   * @param {Object}          validatedReq.query    - Request query object
   * @param {Number}          validatedReq.query.id - Stripe event ID
   * @return {Promise}
   */
  static postPaymentMethod (validatedReq, res) {
    return res.status(501).send('Not yet implented')
  }
}

OrganizationRouter.getScema = Joi.object({
  params: Joi.object({
    id: Joi.number().required()
  })
}).unknown()

module.exports = OrganizationRouter
