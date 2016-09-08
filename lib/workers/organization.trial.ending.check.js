'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))
const moment = require('moment')
const keypather = require('keypather')()
const pluck = require('101/pluck')

const TrialService = require('services/trial-service')
const stripe = require('util/stripe')
const log = require('util/logger').child({ module: 'worker/organization.trial.ending.check' })
const rabbitmq = require('util/rabbitmq')

const errorHandler = require('workers/error-handler')

/**
 * Check for if any organizations are 72 hours or less from ending.
 *
 * This worker should do the following:
 *
 * 1.Check If the organization is 72 hours away form ending
 * 2. Check if `notifiedTrialEnding` is set to `false`
 *
 * If that's the case:
 *
 * 1. Emit a `organization.trial.ending` event (This should only
 * happen once so the DB should be marked with a
 * `notifiedTrialEnding` property)
 *
 * @param {Object}    job          - job passed by RabbitMQ
 * @return {Promise}
 */
module.exports.task = function CheckForOrganizationsWithEndingTrials (job) {
  log.info('CheckForOrganizationsWithEndingTrials called')
  // Get all organizations whose trial ends in 72 hours
  const threeDaysFromNow = moment().add(72, 'hours').toISOString()

  log.trace({ threeDaysFromNow: threeDaysFromNow }, 'Fetching all organizations')
  return TrialService.getFilteredOrgsInTrialByTrialEndTime(threeDaysFromNow)
  .then(function filterAlreadyNotified (organizationWithEndingTrialsAndNoPaymentMethod) {
    return organizationWithEndingTrialsAndNoPaymentMethod.filter(org => {
      return !keypather.get(org, 'subscription.metadata.notifiedTrialEnding')
    })
  })
  .then(function updateNotifiedTrialEndingInStripe (orgsWithEndingTrials) {
    const now = moment()
    // Filter orgs that have subscription and have been updated in Stripe
    return Promise.filter(orgsWithEndingTrials, org => {
      if (!keypather.get(org, 'subscription.id')) {
        return false
      }
      return stripe.updateSubscriptionWithTrialEndingNotification(org.subscription.id, now.toISOString())
      .catch(err => {
        log.warn({ err, org }, 'Error updating subscription for org')
        throw err
      })
      .return(true)
    })
  })
  .tap(function publishEvent (orgsWithEndingTrialsAndUpdatedSubscriptions) {
    orgsWithEndingTrialsAndUpdatedSubscriptions.forEach(org => {
      rabbitmq.publishEvent('organization.trial.ending', {
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
