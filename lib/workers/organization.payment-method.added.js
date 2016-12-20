'use strict'

const Promise = require('bluebird')

const bigPoppa = require('util/big-poppa')
const Joi = require('util/joi')
const log = require('util/logger').child({ module: 'worker/organization.payment-method.added' })
const rabbitmq = require('util/rabbitmq')
const stripe = require('util/stripe')

const errorHandler = require('workers/error-handler')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
module.exports.jobSchema = Joi.object({
  organization: Joi.object({
    id: Joi.number().required()
  }).unknown().required()
}).unknown().required()

/**
 *
 * @param {Object}    job - job passed by RabbitMQ
 * @return {Promise}
 */
module.exports.task = function PayInvoices (job) {
  return bigPoppa.getOrganization(job.organization.id)
  .then(function (org) {
    return Promise.all([
      org,
      stripe.invoices.getCurrentInvoice(org)
    ])
  })
  .spread((org, invoice) => {
    const invoiceHasBeenPaid = invoice.paid
    const invoiceId = invoice.id
    // `allowed` includes the `isActive` flag, but we'd never mark a paying
    // customer as `isActive:false`
    const orgDoesNotCurrentlyHaveActiveSubscription = !org.allowed
    const orgHasPaymentMethod = org.hasPaymentMethod
    log.trace(
      { invoiceHasBeenPaid, invoiceId, orgDoesNotCurrentlyHaveActiveSubscription, orgHasPaymentMethod },
      'Checking if invoice is closed and has been paid'
    )
    if (
      !invoiceHasBeenPaid &&
      orgDoesNotCurrentlyHaveActiveSubscription &&
      orgHasPaymentMethod
    ) {
      const id = org.id
      // If the organization is past its grace period, its subscription should
      // have an `unpaid` or `closed` status and all its invoices
      // should be closed and unpaid. Now, we need to create a new subscription
      // to get them back in our platform.
      return rabbitmq.publishTask('organization.subscription.create', {
        organization: { id }
      })
    }
  })
  .catch(errorHandler)
}
