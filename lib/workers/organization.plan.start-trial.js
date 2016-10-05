'use strict'

const Joi = require('util/joi')
const moment = require('moment')

const logger = require('util/logger').child({ module: 'worker/organization.created' })
const bigPoppa = require('util/big-poppa')
const stripe = require('util/stripe')
const errorHandler = require('workers/error-handler')

const EntityExistsInStripeError = require('errors/entity-exists-error')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
module.exports.jobSchema = Joi.object({
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
module.exports.task = function CreateOrganizationInStripeAndStartTrial (job) {
  const log = logger.child({})
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
      if (!subscription.trial_end) {
        throw new WorkerStopError(
          'No `trialEnd` specified for plan',
          { subscription: subscription, stripeCustomerId: stripeCustomer.id }
        )
      }
      // Extend trial by 6 hours in order to provide enough time for Stripe
      // to charge the customer. This usually takes 1-2 hours.
      let extendedTrialEndTimestamp = moment(subscription.trial_end, 'X').add(6, 'hours')
      return bigPoppa.updateOrganization(job.organization.id, {
        stripeCustomerId: stripeCustomer.id,
        trialEnd: extendedTrialEndTimestamp.toISOString()
      })
    })
    .then(function customerSaved (res) {
      log.trace({ org: res.body }, 'Customer saved in big-poppa')
    })
    .catch(EntityExistsInStripeError, err => {
      log.trace({ err: err }, 'Customer already has a `stripeCustomerId`. Will not create another one.')
      throw new WorkerStopError(
        'Customer already has a `stripeCustomerId`. Not creating another one.',
         { orgId: job.organization.id, err: err }
      )
    })
    .catch(errorHandler)
}
