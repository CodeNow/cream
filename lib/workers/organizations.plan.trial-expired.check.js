'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))
const moment = require('moment')
const keypather = require('keypather')()
const pluck = require('101/pluck')

const TrialService = require('services/trial-service')
const stripe = require('util/stripe')
const util = require('util/index')
const log = require('util/logger').child({ module: 'worker/organizations.trial-almost-expired.check' })

const errorHandler = require('workers/error-handler')
const rabbitmq = require('util/rabbitmq')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
const jobSchema = Joi.object({
  tid: Joi.string().guid()
}).required()

/**
 * Check for if any organizations trial has expired.
 *
 * This worker should do the following:
 *
 * 1. Check if the organization trial has already expired
 * 2. Check if `trialExpiredNotified` is set to `false`
 *
 * If that's the case:
 *
 * 1. Enqueue a `organization.trial-almost-expired` event (This should only happen
 * once so a `trialExpiredNotified` property should be set in the database)
 *
 * @param {Object}    job - job passed by RabbitMQ
 * @return {Promise}
 */
module.exports = function CheckForOrganizationsWithExpiredTrials (job) {
  log.info('CheckForOrganizationsWithExpiredTrials called')

  return Joi.validateAsync(job, jobSchema)
  .then(function fetchAllOrganizations (job) {
    log.trace('Fetching all organizations')
    const now = moment()
    return TrialService.getAllOrgsInTrialByTrialEndTime(now)
  })
  .then(function filterAlreadyNotified (organizationWithEndedTrialsAndNoPaymentMethod) {
    return organizationWithEndedTrialsAndNoPaymentMethod.filter(org => {
      return !pluck(org, 'subscription.metadata.notifiedTrialExpired')
    })
  })
  .tap(function publishEvent (orgsWithExpiredTrials) {
    orgsWithExpiredTrials.forEach(org => {
      rabbitmq.publishEvent('organization.trial.ended', {
        organization: {
          id: org.id,
          name: org.name
        }
      })
    })
  })
  .tap(function updateNotifiedTrialExpiredInStripe (orgsWithExpiredTrials) {
    const now = moment()
    return Promise.map(orgsWithExpiredTrials, org => {
      if (keypather.get(org, 'subscription.id')) {
        return stripe.updateSubsriptionWithTrialExipredNotification(org.subscription.id, now.toISOString())
          .catch(util.logErrorAndKeepGoing({ org }, 'Error updating subscription for org'))
      }
    })
  })
  // For logging purposes
  .then(organizations => organizations.map(pluck('id')))
  .catch(errorHandler)
}
