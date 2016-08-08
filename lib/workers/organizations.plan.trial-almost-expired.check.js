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
 * Check for if any organizations are 72 hours or less from expiring.
 *
 * This worker should do the following:
 *
 * 1.Check If the organization is 72 hours away form expiring
 * 2. Check if `trialAlmostExipredNotified` is set to `false`
 *
 * If that's the case:
 *
 * 1. Emit a `organization.trial-almost-expired` event (This should only
 * happen once so the DB should be marked with a
 * `trialAlmostExipredNotified` property)
 *
 * @param {Object}    job          - job passed by RabbitMQ
 * @param {Number}    job.githubId - Github ID for new User
 * @return {Promise}
 */
module.exports = function CheckForOrganizationsWithAlmostExpiredTrials (job) {
  const log = logger.child({ job: job })
  log.info('CheckForOrganizationsWithAlmostExpiredTrials called')
  return Joi.validateAsync(job, jobSchema)
    .catch(err => {
      throw new WorkerStopError(
        `Invalid Job: ${err.toString()}`,
        { err: err }
      )
    })
}
