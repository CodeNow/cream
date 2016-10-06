'use strict'

const Promise = require('bluebird')
const Joi = require('util/joi')
const moment = require('moment')
const keypather = require('keypather')()

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
      customer: Joi.string().required()
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
  const log = logger.child({ job })
  return stripe.getEvent(job.stripeEventId)
    .then(function validateEvent (rawEvent) {
      return Joi.validateAsync(rawEvent, eventSchema, { stripUnknown: true })
    })
    .then(function fetchOrganization (stripeEvent) {
      log.trace('Stripe event validated')
      // Stripe API always uses UNIX timestamps
      let stripeCustomerId = stripeEvent.data.object.customer
      return Promise.join(
        bigPoppa.getOrganizations({ stripeCustomerId: stripeCustomerId }),
        stripe.getSubscriptionForOrganization(stripeCustomerId)
      )
        .catch(errorHandler.entityNotFoundHandler)
        .spread(function saveUpdatesToOrganization (orgs, subscription) {
          let status = keypather.get(subscription, 'status')
          if (status !== 'active') {
            throw new WorkerStopError(
              `Subscription is not active (${status}). Not updating organization.`,
              { subscription },
              { level: 'info' }
            )
          }
          let currentPeriodEndTimestamp = keypather.get(subscription, 'current_period_end')
          let newActivePeriodEnd = moment(currentPeriodEndTimestamp, 'X')
          let org = orgs[0]
          if (!org) {
            throw new WorkerStopError(`Organization with stripeCustomerId ${stripeCustomerId} not found`)
          }
          log.trace({ orgId: org.id, newActivePeriodEnd: newActivePeriodEnd.toISOString() }, 'Organization found. Updating organization')
          return bigPoppa.updateOrganization(
            org.id,
            { activePeriodEnd: newActivePeriodEnd.toISOString() }
          )
        })
    })
    .catch(errorHandler)
}
