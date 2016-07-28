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
  tid: Joi.string().guid()
})

/**
 * Check for if any organizations trial has expired.
 *
 * If the organization trial has already expired and `trialExpiredNotified` is
 * set to `false`:
 *
 * 1. Mark the `trialExpiredNotified` as `true`
 * 2. Enqueue a job in pheidi to notify the all users iowner.
 *
 * @param {Object}    job - job passed by RabbitMQ
 * @return {Promise}
 */
module.exports = function CheckForOrganizationsWithAlmostExpiredTrials (job) {
  const log = logger.child({ job: job, method: 'CheckForOrganizationsWithAlmostExpiredTrials' })
  log.info('CheckForOrganizationsWithAlmostExpiredTrials called')
  return Joi.validateAsync(job, jobSchema)
    .catch(err => {
      throw new WorkerStopError(
        `Invalid Job: ${err.toString()}`,
        { err: err }
      )
    })
}
