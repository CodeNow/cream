'use strict'

const Promise = require('bluebird')
const Joi = require('util/joi')
const moment = require('moment')
const keypather = require('keypather')()

const stripe = require('util/stripe')
const bigPoppa = require('util/big-poppa')
const logger = require('util/logger').child({ module: 'worker/stripe.invoice.payment-failed' })
const rabbitmq = require('util/rabbitmq')

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

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
const eventSchema = Joi.object({
  id: Joi.string().required(),
  type: Joi.string().valid('invoice.payment_failed').required(), // Don't allow any other type of event
  data: Joi.object({
    object: Joi.object({
      object: Joi.string().valid('invoice').required(),
      id: Joi.string().required(),
      customer: Joi.string().required()
    }).unknown().required()
  }).required()
}).unknown().required()

/**
 * Process when a payment fails. This worker should do the following:
 *
 * This worker should do the following:
 *
 * 1. Enqueue a job to email the owner of the credit card
 *
 * @param {Object}    job                  - job passed by RabbitMQ
 * @param {Number}    job.stripeCustomerId - Stripe customer ID
 * @return {Promise}
 */
module.exports.task = function ProcessPaymentFailure (job) {
  const log = logger.child({})
  return stripe.getEvent(job.stripeEventId)
    .then(function validateEvent (rawEvent) {
      return Joi.validateAsync(rawEvent, eventSchema, { stripUnknown: true })
    })
    .then(function getInvoice (stripeEvent) {
      let invoiceId = stripeEvent.data.object.id
      let stripeCustomerId = stripeEvent.data.object.customer
      return stripe.invoices.get(invoiceId)
      .then(function checkIfNotificationHasBeenSent (invoice) {
        if (keypather.get(invoice, 'metadata.notifiedAdminPaymentFailed')) {
          throw new WorkerStopError('Organization paymentMethodOwner has already been notified about invoice payment failure')
        }
        return bigPoppa.getOrganizations({ stripeCustomerId })
      })
      .then(function checkIfOrgHasPaymentMethod (orgs) {
        let org = orgs[0]
        if (!org) {
          throw new WorkerStopError(`Organization with stripeCustomerId ${stripeCustomerId} not found`)
        }
        if (!org.hasPaymentMethod) {
          // This is expected behavior if the org has an expiring trial or removed
          // their payment method
          throw new WorkerStopError('Organization has no payment-method. This payment was expected to fail, so user will not be nofitied.', { org }, { level: 'info' })
        }
        return Promise.all([ org, stripe.getCustomerPaymentMethodOwner(stripeCustomerId) ])
      })
      .spread(function saveUpdatesToOrganization (org, paymentMethodOwner) {
        log.trace({ orgId: org.id }, 'Organization found. Updating invoice')
        const now = moment()
        return stripe.invoices.updateNotifiedAdminPaymentFailed(invoiceId, paymentMethodOwner.id, now.toISOString())
        .then(() => {
          rabbitmq.publishEvent('organization.invoice.payment-failed', {
            invoicePaymentHasFailedFor24Hours: false,
            organization: {
              id: org.id,
              name: org.name
            },
            paymentMethodOwner: {
              githubId: paymentMethodOwner.githubId
            }
          })
        })
      })
    })
    .catch(errorHandler.entityNotFoundHandler)
    .catch(errorHandler)
}
