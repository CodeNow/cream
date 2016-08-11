'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))

const logger = require('util/logger').child({ module: 'worker/organization.created' })
const bigPoppa = require('util/big-poppa')
const stripe = require('util/stripe')

const EntityExistsInStripeError = require('errors/entity-exists-error')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
const jobSchema = Joi.object({
  tid: Joi.string().guid(),
  organization: Joi.object({
    id: Joi.number().required() // big-poppa id
  }).unknown().required()
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
module.exports = function CreateOrganizationInStripeAndStartTrial (rawJob) {
  const log = logger.child({ rawJob: rawJob })
  log.info('CreateOrganizationInStripeAndStartTrial called')
  return Joi.validateAsync(rawJob, jobSchema)
    .then(function fetchOrgnization (job) {
      log.trace('Fetching organization')
      return bigPoppa.getOrganization(job.organization.id)
        .then(function createCustomerInStripe (org) {
          log.trace({ org: org }, 'Creating customer in Stripe')
          return stripe.createCustomerAndSubscriptionForOrganization(org)
        })
        .then(function saveCustomerId (res) {
          let stripeCustomer = res.customer
          let subscription = res.subscription
          log.trace({
            stripeCustomer: stripeCustomer,
            subscription: subscription
          }, 'Customer created in Stripe. Saving `stripeCustomerId`')
          let trialEndTimestamp = subscription.trial_end
          if (!trialEndTimestamp) {
            throw new WorkerStopError(
              'No `trialEnd` specified for plan',
              { subscription: subscription, stripeCustomerId: stripeCustomer.id }
            )
          }
          return bigPoppa.updateOrganization(job.organization.id, {
            stripeCustomerId: stripeCustomer.id,
            trialEnd: trialEndTimestamp
          })
        })
        .then(function customerSaved (res) {
          log.trace({ org: res.body }, 'Customer saved in big-poppa')
        })
    })
    .catch(EntityExistsInStripeError, err => {
      log.trace({ err: err }, 'Customer already has a `stripeCustomerId`. Will not create another one.')
      throw new WorkerStopError(
        'Customer already has a `stripeCustomerId`. Not creating another one.',
         { orgId: rawJob.organization.id, err: err }
      )
    })
    .catch(err => {
      if (err.message.match(/resource.*not.*found/i)) {
        throw new WorkerStopError(
          `Organization with id ${rawJob.organization.id} does not exist`
        )
      }
      if (err.isJoi) {
        throw new WorkerStopError(
          `Invalid Job: ${err.toString()}`,
          { err: err }
        )
      }
      throw err
    })
}
