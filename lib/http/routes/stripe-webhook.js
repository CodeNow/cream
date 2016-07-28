'use strict'

const Promise = require('bluebird')
const express = require('express')
const Joi = Promise.promisifyAll(require('joi'))

const stripe = require('util/stripe')
const rabbitmq = require('util/rabbitmq')
const BaseRouter = require('http/routes/base')

class StripeWebhookRouter extends BaseRouter {

  /**
   * Generate an express router based on the router class
   *
   * @returns {Object} - An newly generated express router
   */
  static router () {
    const router = express.Router()
    router.post('/', StripeWebhookRouter.createRoute(StripeWebhookRouter.post, StripeWebhookRouter.postSchema))
    return router
  }

  /**
   * Process Stripe webhooks and enqueue a job if it's something we care about
   *
   * @param {Object}          validatedReq          - Validated request against `getSchema`
   * @param {Object}          validatedReq.query    - Request query object
   * @param {Number}          validatedReq.query.id - Stripe event ID
   * @return {Promise}
   */
  static post (validatedReq, res) {
    let stripeEventId = validatedReq.body.id
    Promise.fromCallback(cb => {
      stripe.events.retrieve(stripeEventId, cb)
    })
      .then(function enqueueJob (stripeEvent) {
        if (stripeEvent.type === 'invoice.created') {
          return rabbitmq.publishProcessInvoice(stripeEvent)
        }
        if (stripeEvent.type === 'invoice.payment_succeeded') {
          return rabbitmq.publishInvoicePaymentSucceeded(stripeEvent)
        }
        if (stripeEvent.type === 'invoice.payment_failed') {
          return rabbitmq.publishInvoicePaymentSucceeded(stripeEvent)
        }
      })
      .then(() => res.send(200))
  }
}

StripeWebhookRouter.postSchema = Joi.object({
  body: Joi.object({
    id: Joi.string().required()
  }).unknown().required()
}).unknown()

module.exports = StripeWebhookRouter
