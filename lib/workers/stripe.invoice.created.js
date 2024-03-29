'use strict'

const Joi = require('util/joi')
const stripe = require('util/stripe')
const bigPoppa = require('util/big-poppa')
const rabbitmq = require('util/rabbitmq')

const logger = require('util/logger').child({ module: 'worker/organization.plan.update' })
const errorHandler = require('workers/error-handler')

const WorkerStopError = require('error-cat/errors/worker-stop-error')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
module.exports.jobSchema = Joi.object({
  stripeEventId: Joi.string().required()
}).unknown().required()

const eventSchema = Joi.object({
  id: Joi.string().required(),
  type: Joi.string().valid('invoice.created').required(), // Don't allow any other type of event
  data: Joi.object({
    object: Joi.object({
      object: Joi.string().valid('invoice').required(),
      id: Joi.string().required(),
      closed: Joi.boolean().required(),
      customer: Joi.string().required(),
      period_end: Joi.date().timestamp('unix').required(),
      paid: Joi.boolean().required()
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
  return stripe.getEvent(job.stripeEventId)
    .then(function validateEvent (rawEvent) {
      return Joi.validateAsync(rawEvent, eventSchema, { stripUnknown: true })
    })
    .then(function fetchOrganization (stripeEvent) {
      log.trace({ stripeEvent }, 'Fetching organization in order to update plan')
      let stripeCustomerId = stripeEvent.data.object.customer
      return bigPoppa.getOrganizations({ stripeCustomerId: stripeCustomerId })
        .then(function checkOrganizationExists (orgs) {
          let org = orgs[0]
          if (!org) {
            throw new WorkerStopError(`No organization with stripeCustomerId ${stripeCustomerId}`)
          }
          return org
        })
        .tap(stripe.subscriptions.updatePlanIdForOrganizationBasedOnCurrentUsage)
        .tap(function updateInvoiceWithPaymentMethodOwner (org) {
          let invoiceId = stripeEvent.data.object.id
          return stripe.invoices.updateWithPaymentMethodOwner(org, invoiceId)
        })
        .tap(function payInvoice (org) {
          const invoiceIsClosed = stripeEvent.data.object.closed
          const invoiceHasBeenPaid = stripeEvent.data.object.paid
          const invoiceId = stripeEvent.data.object.id
          const orgHasPaymentMethod = org.hasPaymentMethod
          log.trace(
            { invoiceHasBeenPaid, invoiceId, invoiceIsClosed, orgHasPaymentMethod },
            'Checking if invoice is closed and has been paid'
          )
          // Pay invoice now because Stripe takes 1-2 hours to pay invoice
          // which lands customers in grace period
          // All modifications to the invoice should be done by this point
          if (!invoiceHasBeenPaid && !invoiceIsClosed && orgHasPaymentMethod) {
            return rabbitmq.publishTask('organization.invoice.pay', {
              invoice: { id: invoiceId },
              organization: { id: org.id }
            })
          }
        })
    })
    .catch(errorHandler)
}
