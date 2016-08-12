'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))

const logger = require('util/logger').child({ module: 'worker/stripe.invoice.process' })
const stripe = require('util/stripe')
const bigPoppa = require('util/big-poppa')

const WorkerStopError = require('error-cat/errors/worker-stop-error')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
module.exports.jobSchema = Joi.object({
  tid: Joi.string().guid(),
  id: Joi.string().required()
}).required()

const eventSchema = Joi.object({
  id: Joi.string().required(),
  type: Joi.string().valid('invoice.created').required(), // Don't allow any other type of event
  data: Joi.object({
    object: Joi.object({
      object: Joi.string().valid('invoice').required(),
      id: Joi.string().required(),
      customer: Joi.string().required(),
      period_end: Joi.date().timestamp('unix').required()
    }).unknown().required()
  }).required()
}).unknown().required()

/**
 * Process when an invoice is received from Stripe. This should happen at about
 * an hour before the invoice is sent to the customer/organization.
 *
 * This worker should do the following:
 *
 * 1. Query the number of instances the organization currently has
 * 2. Add current number of instances to the upcoming invoice (in an hour)
 * 3. Change the organization's plan in Stripe based on the current number of
 * instances (that's how they'll be charged when the invoice goes through)
 *
 * @param {Object}    job                  - job passed by RabbitMQ
 * @param {Number}    job.stripeCustomerId - Stripe Customer ID
 * @return {Promise}
 */
module.exports.task = function ProcessInvoiceCreated (job) {
  const log = logger.child({})
  log.info('ProcessInvoiceCreated called')
  return stripe.getEvent(job.id)
    .then(function validateEvent (rawEvent) {
      return Joi.validateAsync(rawEvent, eventSchema, { stripUnknown: true })
    })
    .then(function fetchOrgnization (stripeEvent) {
      let stripeCustomerId = stripeEvent.data.object.customer
      return bigPoppa.getOrganizations({ stripeCustomerId: stripeCustomerId })
        .then(function checkOrganizationExists (orgs) {
          let org = orgs[0]
          if (!org) {
            throw new WorkerStopError(`Organization with customerId ${stripeCustomerId}`)
          }
        })
      .then(function updateOrganization (org) {
        return stripe.updatePlanIdForOrganizationBaseOnCurrentUsage(org)
      })
      .then(function updateInvoiceWithPaymentMethodOwner (org) {
        let invoiceId = stripeEvent.data.object.id
        return stripe.updateInvoiceWithPaymentMethodOwner(org, invoiceId)
      })
    })
    .catch(err => {
      if (err.message.match(/resource.*not.*found/i)) {
        throw new WorkerStopError(
          `Organization does not exist`,
          { err: err }
        )
      }
      if (err.isJoi) {
        throw new WorkerStopError(
          `Invalid Job: ${err.toString()}`,
          { err: err }
        )
      }
      throw err
    })
}
