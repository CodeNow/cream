'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))

const logger = require('util/logger').child({ module: 'worker/organizations.trial-almost-expired.check' })

const WorkerStopError = require('error-cat/errors/worker-stop-error')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
const jobSchema = Joi.object({
  tid: Joi.string().guid()
}).required()

/**
 * Check for if any organizations trial has expired.
 *
 * This worker should do the following:
 *
 * 1. Check if the organization trial has already expired
 * 2. Check if `trialExpiredNotified` is set to `false`
 *
 * If that's the case:
 *
 * 1. Enqueue a `organization.trial-almost-expired` event (This should only happen
 * once so a `trialExpiredNotified` property should be set in the database)
 *
 * @param {Object}    job - job passed by RabbitMQ
 * @return {Promise}
 */
module.exports = function CheckForOrganizationsWithExpiredTrials (job) {
  const log = logger.child({ job: job, method: 'CheckForOrganizationsWithExpiredTrials' })
  log.info('CheckForOrganizationsWithExpiredTrials called')
  return Joi.validateAsync(job, jobSchema)
    .catch(err => {
      throw new WorkerStopError(
        `Invalid Job: ${err.toString()}`,
        { err: err }
      )
    })
}
