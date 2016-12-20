'use strict'

const stripe = require('util/stripe')
const schemas = require('schemas')

const logger = require('util/logger').child({ module: 'worker/organization.invoice.pay' })
const errorHandler = require('workers/error-handler')

/**
 * Schema for organization.invoice.pay jobs.
 * @type {Joi~Schema}
 */
module.exports.jobSchema = schemas.payInvoiceSchema

/**
 * Pay the current invoice
 *
 * @param {Object}    job                 - job passed by RabbitMQ
 * @param {Number}    job.organization.id - Organization BP Id
 * @return {Promise}
 */
module.exports.task = function PayInvoice (job) {
  const log = logger.child({ job })
  return stripe.invoices.get(job.invoice.id)
  .then(invoice => {
    log.trace({ invoice }, 'Invoice fetched')
    if (!invoice.paid && !invoice.closed) {
      log.trace('Pay invoice')
      return stripe.invoice.pay()
    }
    log.trace('Invoice is alrady paid or closed')
  })
  .catch(errorHandler)
}
