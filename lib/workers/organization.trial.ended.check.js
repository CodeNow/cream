'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))
const moment = require('moment')
const keypather = require('keypather')()
const pluck = require('101/pluck')

const TrialService = require('services/trial-service')
const stripe = require('util/stripe')
const log = require('util/logger').child({ module: 'worker/organization.trial.ended.check' })
const rabbitmq = require('util/rabbitmq')

const errorHandler = require('workers/error-handler')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */

module.exports.jobSchema = Joi.object({
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
module.exports.task = function CheckForOrganizationsWithEndedTrials (job) {
  log.info('CheckForOrganizationsWithEndedTrials called')
  // Get all organizations whose trial has ended
  const now = moment().toISOString()

  log.trace({ now: now }, 'Fetching all organizations')
  return TrialService.getFilteredOrgsInTrialByTrialEndTime(now)
  .then(function filterAlreadyNotified (organizationWithEndedTrialsAndNoPaymentMethod) {
    return organizationWithEndedTrialsAndNoPaymentMethod.filter(org => {
      return !keypather.get(org, 'subscription.metadata.notifiedTrialEnded')
    })
  })
  .then(function updateNotifiedTrialEndedInStripe (orgsWithEndedTrials) {
    // Filter orgs that have subscription and have been updated in Stripe
    return Promise.filter(orgsWithEndedTrials, org => {
      if (!keypather.get(org, 'subscription.id')) {
        return false
      }
      return stripe.updateSubscriptionWithTrialEndedNotification(org.subscription.id, now)
      .catch(err => {
        log.warn({ err, org }, 'Error updating subscription for org')
        throw err
      })
      .return(true)
    })
  })
  .tap(function publishEvent (orgsWithEndedTrialsAndUpdatedSubscriptions) {
    orgsWithEndedTrialsAndUpdatedSubscriptions.forEach(org => {
      rabbitmq.publishEvent('organization.trial.ended', {
        organization: {
          id: org.id,
          name: org.name
        }
      })
    })
  })
  // For logging purposes
  .map(pluck('id'))
  .catch(errorHandler)
}
