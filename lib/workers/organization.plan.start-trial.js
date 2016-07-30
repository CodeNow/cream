'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))

const logger = require('util/logger').child({ module: 'worker/organization.created' })

const WorkerStopError = require('error-cat/errors/worker-stop-error')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
const jobSchema = Joi.object({
  tid: Joi.string().guid(),
  organizationId: Joi.number().required() // big-poppa id
})

/**
 * Create an organization in Stripe
 *
 * This worker should do the following:
 *
 * 1. Create the organization in Stripe
 * 2. Start trial for organization in Stripe
 * 3. Update the `stripeCustomerId` in big-poppa
 * 4. Update the `trialEnd` in big-poppa
 * 5. Update the `gracePeriodEnd` in big-poppa to 72 hours after `trialEnd`
 *
 * @param {Object}    job - job passed by RabbitMQ
 * @return {Promise}
 */
module.exports = function CreateOrganizationInStripeAndStartTrial (job) {
  const log = logger.child({ job: job, method: 'CreateOrganizationInStripeAndStartTrial' })
  log.info('CreateOrganizationInStripeAndStartTrial called')
  return Joi.validateAsync(job, jobSchema)
    .catch(err => {
      throw new WorkerStopError(
        `Invalid Job: ${err.toString()}`,
        { err: err }
      )
    })
}
