'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))

const logger = require('util/logger').child({ module: 'worker/organization.plan.changes.check' })

const WorkerStopError = require('error-cat/errors/worker-stop-error')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
const jobSchema = Joi.object({
  tid: Joi.string().guid()
}).required()

/**
 * Check if the organization has changes plans by adding/removing containers
 *
 * This worker should do the following:
 *
 * 1. Check number of configs/instances organization currently has
 * 2. If they have upgraded/downgraded, enqueue a pheidi job to notify them their plan has changed
 *
 * @param {Object}    job                  - job passed by RabbitMQ
 * @param {Number}    job.stripeCustomerId - Stripe Customer ID
 * @return {Promise}
 */
module.exports = function CheckIfOrganizationPlanHasChanged (job) {
  const log = logger.child({ job: job, method: 'CheckIfOrganizationPlanHasChanged' })
  log.info('CheckIfOrganizationPlanHasChanged called')
  return Joi.validateAsync(job, jobSchema)
    .catch(err => {
      throw new WorkerStopError(
        `Invalid Job: ${err.toString()}`,
        { err: err }
      )
    })
}
