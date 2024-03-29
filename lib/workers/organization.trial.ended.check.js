'use strict'

const Promise = require('bluebird')
const moment = require('moment')
const keypather = require('keypather')()
const pluck = require('101/pluck')

const OrganizationService = require('services/organization-service')
const stripe = require('util/stripe')
const log = require('util/logger').child({ module: 'worker/organization.trial.ended.check' })
const rabbitmq = require('util/rabbitmq')

const errorHandler = require('workers/error-handler')

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
  // Get all organizations whose trial has ended
  const now = moment()
  const nowISOString = now.toISOString()
  const oneDayAgoISOString = now.clone().subtract(1, 'day').toISOString()

  log.trace({ oneDayAgoISOString, nowISOString }, 'Fetching all organizations')
  return OrganizationService.getFilteredOrgsInTrialByTrialEndTime(oneDayAgoISOString, nowISOString)
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
      return stripe.subscriptions.updateWithTrialEndedNotification(org.subscription.id, nowISOString)
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
