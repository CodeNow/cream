'use strict'

const Joi = require('util/joi')

const logger = require('util/logger').child({ module: 'worker/organization.plan.update' })
const bigPoppa = require('util/big-poppa')
const stripe = require('util/stripe')

const errorHandler = require('workers/error-handler')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
module.exports.jobSchema = Joi.object({
  organization: Joi.object({
    id: Joi.number().required()
  }).unknown().required()
}).unknown().required()

/**
 * Process when the number of users is changed for an organization
 *
 * This worker should do the following:
 *
 * 1. Update Stripe plan with current number of users in an organization
 *
 * @param {Object}    job          - job passed by RabbitMQ
 * @param {Number}    job.githubId - Github ID for new User
 * @return {Promise}
 */
module.exports.task = function UpdatePlan (job) {
  const log = logger.child({})
  return bigPoppa.getOrganization(job.organization.id)
    .then(function checkOrganization (org) {
      if (!org.stripeCustomerId) {
        log.trace({ org: org }, 'Organization has no `stripeCustomerId`. Call `organization.plan.start-trial` to create `stripeCustomerId`.')
        throw new WorkerStopError(
          'Organization does not have has a `stripeCustomerId`. Call `organization.plan.start-trial` to create `stripeCustomerId`.',
          { org },
          { level: 'info' } // Expected behavior if first user
        )
      }
      return org
    })
    .then(stripe.subscriptions.updateUsersForPlan)
    .catch(errorHandler)
}
