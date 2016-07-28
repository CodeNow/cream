'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))

const logger = require('util/logger').child({ module: 'worker/organization.invoice.payment-failed' })

const WorkerStopError = require('error-cat/errors/worker-stop-error')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
const jobSchema = Joi.object({
  tid: Joi.string().guid(),
  stripeCustomerId: Joi.string().required()
})

/**
 * Process when a payment fails. This worker should do the following:
 *
 * 1. Email the owner of the credit card
 *
 * @param {Object}    job                  - job passed by RabbitMQ
 * @param {Number}    job.stripeCustomerId - Stripe customer ID
 * @return {Promise}
 */
module.exports = function ProcessPaymentFailedForOrganization (job) {
  const log = logger.child({ job: job, method: 'ProcessPaymentFailedForOrganization' })
  log.info('ProcessPaymentFailedForOrganization called')
  return Joi.validateAsync(job, jobSchema)
    .catch(err => {
      throw new WorkerStopError(
        `Invalid Job: ${err.toString()}`,
        { err: err }
      )
    })
}
