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
 * Check for if any organizations' trial or active period are about to expire.
 *
 * If the organization trial or active period are about to expire and the
 * `numberOfInstances` on the next invoice has not been set:
 *
 * 1. Enqueue a `organization.invoice.pre-process` job
 *
 * @param {Object}    job - job passed by RabbitMQ
 * @return {Promise}
 */
module.exports = function CheckForAlmostInactiveOrganizations (job) {
  const log = logger.child({ job: job, method: 'CheckForAlmostInactiveOrganizations' })
  log.info('CheckForAlmostInactiveOrganizations called')
  return Joi.validateAsync(job, jobSchema)
    .catch(err => {
      throw new WorkerStopError(
        `Invalid Job: ${err.toString()}`,
        { err: err }
      )
    })
}
