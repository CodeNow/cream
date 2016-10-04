'use strict'

const Promise = require('bluebird')
const Joi = require('joi')

const logger = require('util/logger').child({ module: 'worker/organization.plan.changes.check' })

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
module.exports.jobSchema = Joi.object({
  tid: Joi.string().guid()
}).required()

/**
 * Check if the organization has changes plans by adding/removing containers
 *
 * This worker should do the following:
 *
 * 1. Check number of configs/instances organization currently has
 * 2. If they have upgraded/downgraded, publish an `organization.plan.changed` event
 *
 * @param {Object}    job                  - job passed by RabbitMQ
 * @param {Number}    job.stripeCustomerId - Stripe Customer ID
 * @return {Promise}
 */
module.exports.task = function CheckIfOrganizationPlanHasChanged (job) {
  const log = logger.child({})
  log.info('CheckIfOrganizationPlanHasChanged called')
}
