'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))
const log = require('util/logger').child({ module: 'worker/organization.trial.ended.check' })

const WorkerStopError = require('error-cat/errors/worker-stop-error')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
const jobSchema = Joi.object({
  tid: Joi.string().guid()
}).required()

/**
 * Check for if any organizations trial has ended.
 *
 * This worker should do the following:
 *
 * 1. Check if the organization trial has already ended
 * 2. Check if `notifiedTrialEnded` is set to `false`
 *
 * If that's the case:
 *
 * 1. Enqueue a `organization.trial.ended` event (This should only happen
 * once so a `notifiedTrialEnded` property should be set in the database)
 *
 * @param {Object}    job - job passed by RabbitMQ
 * @return {Promise}
 */
module.exports = function CheckForOrganizationsWithEndedTrials (job) {
  log.info('CheckForOrganizationsWithEndedTrials called')
  return Joi.validateAsync(job, jobSchema)
    .catch(err => {
      throw new WorkerStopError(
        `Invalid Job: ${err.toString()}`,
        { err: err }
      )
    })
}
