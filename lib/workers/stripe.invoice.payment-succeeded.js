'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))
const moment = require('moment')

const logger = require('util/logger').child({ module: 'worker/stripe.invoice.payment-succeeded' })
const stripe = require('util/stripe')
const bigPoppa = require('util/big-poppa')

const errorHandler = require('workers/error-handler')

const WorkerStopError = require('error-cat/errors/worker-stop-error')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
module.exports.jobSchema = Joi.object({
  tid: Joi.string().guid(),
  stripeEventId: Joi.string().required()
}).required()

const eventSchema = Joi.object({
  id: Joi.string().required(),
  type: Joi.string().valid('invoice.payment_succeeded').required(),
  data: Joi.object({
    object: Joi.object({
      object: Joi.string().valid('invoice').required(),
      customer: Joi.string().required(),
      period_end: Joi.date().timestamp('unix').required()
    }).unknown().required()
  }).required()
}).unknown().required()

/**
 * Process when a payment succeeds. This worker should do the following:
 *
 * 1. Update the `activePeriodEnds` property
 *
 * @param {Object}    job                  - job passed by RabbitMQ
 * @param {Number}    job.stripeCustomerId - Stripe Customer ID
 * @return {Promise}
 */
module.exports.task = function ProcessPaymentSucceeded (job) {
  const log = logger.child({})
  log.info('ProcessPaymentSucceeded called')
  return stripe.getEvent(job.stripeEventId)
    .then(function validateEvent (rawEvent) {
      return Joi.validateAsync(rawEvent, eventSchema, { stripUnknown: true })
    })
    .then(function fetchOrganization (stripeEvent) {
      // Stripe API always uses UNIX timestamps
      let newActivePeriodEnd = moment(stripeEvent.data.object.period_end, 'X')
      let stripeCustomerId = stripeEvent.data.object.customer
      return bigPoppa.getOrganizations({ stripeCustomerId: stripeCustomerId })
        .then(function saveUpdatesToOrganization (orgs) {
          let org = orgs[0]
          if (!org) {
            throw new WorkerStopError(`Organization with stripeCustomerId ${stripeCustomerId} not found`)
          }
          return bigPoppa.updateOrganization(
            org.id,
            { activePeriodEnd: newActivePeriodEnd.toISOString() }
          )
        })
    })
    .catch(errorHandler)
}
