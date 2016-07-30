'use strict'

const Promise = require('bluebird')
const express = require('express')
const Joi = Promise.promisifyAll(require('joi'))

const logger = require('util/logger').child({ module: 'stripe-webhook-router' })
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
    const log = logger.child({ validatedReq: validatedReq, method: 'post' })
    log.info('Post called')
    let stripeEventId = validatedReq.body.id
    return Promise.fromCallback(cb => {
      stripe.events.retrieve(stripeEventId, cb)
    })
      .then(function enqueueJob (stripeEvent) {
        switch (stripeEvent.type) {
          case 'invoice.created':
            rabbitmq.publishProcessInvoice(stripeEvent)
            res.status(200)
            break
          case 'invoice.payment_succeeded':
            rabbitmq.publishInvoicePaymentSucceeded(stripeEvent)
            res.status(200)
            break
          case 'invoice.payment_failed':
            rabbitmq.publishInvoicePaymentFailed(stripeEvent)
            res.status(200)
            break
          default:
            log.trace({ eventType: stripeEvent.type }, 'No stripe event found')
            res.status(204)
        }
      })
  }
}

StripeWebhookRouter.postSchema = Joi.object({
  body: Joi.object({
    id: Joi.string().required()
  }).unknown().required()
}).unknown()

module.exports = StripeWebhookRouter
