'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))

const logger = require('util/logger').child({ module: 'worker/stripe.invoice.payment-succeeded' })

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
 * Process when a payment succeeds. This worker should do the following:
 *
 * 1. Update the `activePeriodEnds` and `gracePeriodEnds` properties
 *
 * @param {Object}    job                  - job passed by RabbitMQ
 * @param {Number}    job.stripeCustomerId - Stripe Customer ID
 * @return {Promise}
 */
module.exports = function ProcessPaymentSucceeded (job) {
  const log = logger.child({ job: job, method: 'ProcessPaymentSucceeded' })
  log.info('ProcessPaymentSucceeded called')
  return Joi.validateAsync(job, jobSchema)
    .catch(err => {
      throw new WorkerStopError(
        `Invalid Job: ${err.toString()}`,
        { err: err }
      )
    })
}
