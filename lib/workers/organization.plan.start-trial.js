'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))
const keypather = require('keypather')()

const logger = require('util/logger').child({ module: 'worker/organization.created' })

const WorkerStopError = require('error-cat/errors/worker-stop-error')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
const jobSchema = Joi.object({
  tid: Joi.string().guid(),
  organizationId: Joi.number().required() // big-poppa id
}).unknown().required()

/**
 * Create an organization in Stripe
 *
 * This worker should do the following:
 *
 * 1. Create the organization in Stripe
 * 2. Start trial for organization in Stripe
 * 3. Update the `stripeCustomerId` in big-poppa
 * 4. Update the `trialEnd` in big-poppa
 *
 * @param {Object}    job - job passed by RabbitMQ
 * @return {Promise}
 */
module.exports = function CreateOrganizationInStripeAndStartTrial (job) {
  const log = logger.child({ job: job, method: 'CreateOrganizationInStripeAndStartTrial' })
  log.info('CreateOrganizationInStripeAndStartTrial called')
  return Joi.validateAsync(rawJob, jobSchema)
    .then(function fetchOrgnization (job) {
      log.trace('Fetching organization')
      return bigPoppa.getOrganization(job.organizationId)
        .then(function createCustomerInStripe (res) {
          let org = res.body
          log.trace({ org: org }, 'Creating customer in Stripe')
          return stripe.createCustomer(org, job.planId || null)
        })
        .then(function saveCustomerId (stripeCustomer) {
          log.trace({ stripeCustomer: stripeCustomer }, 'Customer created in Stripe. Saving `stripeCustomerId`')
          let trialEndTimestamp = keypather.get(stripeCustomer, 'subscriptions.data[0].trial_end')
          if (!trialEndTimestamp) {
            throw new WorkerStopError(
              `No 'trialEnd' specified for plan`
            )
          }
          return bigPoppa.updateOrganization(job.organizationId, {
            stripeCustomerId: stripeCustomer.id,
            trialEnd: trialEndTimestamp
          })
        })
        .then(function customerSaved (res) {
          log.trace({ org: res.body }, 'Customer saved in big-poppa')
        })
    })
    .catch(err => {
      throw new WorkerStopError(
        `Invalid Job: ${err.toString()}`,
        { err: err }
      )
    })
}
