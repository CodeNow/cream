'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))

const logger = require('util/logger').child({ module: 'worker/organizations.invoice.payment-failed.check' })

const WorkerStopError = require('error-cat/errors/worker-stop-error')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
const jobSchema = Joi.object({
  tid: Joi.string().guid()
}).required()

/**
 * Check if the payment for an org has been failing for more than 24 hours
 *
 * This worker should do the following:
 *
 * 1. Check if payment has failed for more than 24 hours
 * 2. Check if the invoice is not marked with `paymentFailedCheck`
 *
 * If that's the case:
 *
 * 1. Emit a `organization.invoice.payment-failed` event (This should only
 * happen once per invoice so the stripe invoice should be marked with something
 * like a `paymentFailedCheck` property)
 *
 * @param {Object}    job          - job passed by RabbitMQ
 * @param {Number}    job.githubId - Github ID for new User
 * @return {Promise}
 */
module.exports = function CheckInvoicedPaymentFailed (job) {
  const log = logger.child({ job: job })
  log.info('CheckInvoicedPaymentFailed called')
  return Joi.validateAsync(job, jobSchema)
    .catch(err => {
      throw new WorkerStopError(
        `Invalid Job: ${err.toString()}`,
        { err: err }
      )
    })
}
