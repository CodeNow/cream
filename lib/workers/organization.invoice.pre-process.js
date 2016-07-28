'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))

const logger = require('util/logger').child({ module: 'worker/organization.trial-almost-expired.check' })

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
 * Pre-process the upcoming invoice for charing and notify the card-holder.
 *
 * 1. Query the number of instances the organization currently has
 * 2. Save the number of instances to the invoice object in Stripe
 * 3. Enqueue a job in pheidi to notify the account holder what they will be charged for
 *
 * @param {Object}    job - job passed by RabbitMQ
 * @return {Promise}
 */
module.exports = function PreProcessInvoideForOrganization (job) {
  const log = logger.child({ job: job, method: 'PreProcessInvoideForOrganization' })
  log.info('PreProcessInvoideForOrganization called')
  return Joi.validateAsync(job, jobSchema)
    .catch(err => {
      throw new WorkerStopError(
        `Invalid Job: ${err.toString()}`,
        { err: err }
      )
    })
}
