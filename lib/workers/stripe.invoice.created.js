'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))

const logger = require('util/logger').child({ module: 'worker/stripe.invoice.process' })

const WorkerStopError = require('error-cat/errors/worker-stop-error')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
const jobSchema = Joi.object({
  tid: Joi.string().guid(),
  stripeCustomerId: Joi.string().required()
}).required()

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
module.exports = function ProcessInvoiceCreated (job) {
  const log = logger.child({ job: job })
  log.info('ProcessInvoiceCreated called')
  return Joi.validateAsync(job, jobSchema)
    .catch(err => {
      throw new WorkerStopError(
        `Invalid Job: ${err.toString()}`,
        { err: err }
      )
    })
}
