'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))
const moment = require('moment')
const keypather = require('keypather')()
const stripe = require('util/stripe')

const bigPoppa = require('util/big-poppa')
const logger = require('util/logger').child({ module: 'worker/organizations.trial-almost-expired.check' })

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
  const log = logger.child({})
  log.info('CheckForOrganizationsWithExpiredTrials called')

  // Cache subscription IDs
  const subscriptionIds = {}

  const logErrorAndKeepGoing = err => {
    log.warn({ err: err })
    return null
  }

  return Joi.validateAsync(job, jobSchema)
    .then(function fetchAllOrganizations (job) {
      log.trace('Fetching all organizations')
      return bigPoppa.getOrganizations({})
    })
    .then(function filterOrganizationsWithExpiredTrials (organizations) {
      const now = moment()
      return organizations.filter(org => {
        const trialEnd = moment(org.trialEnd)
        return now.isAfter(trialEnd) && !org.hasPaymentMethod && org.stripeCustomerId
      })
    })
    .then(function filterAlreadyNotified (organizationWithEndedTrialsAndNoPaymentMethod) {
      return Promise.filter(organizationWithEndedTrialsAndNoPaymentMethod, org => {
        return stripe.getSubscriptionForOrganization(org.stripeCustomerId)
          .catch(logErrorAndKeepGoing)
          .then(stripeSubscription => {
            subscriptionIds[org.id] = stripeSubscription.id
            return keypather.get(stripeSubscription, 'metadata.notifiedTrialExpired')
          })
      })
    })
    .tap(function publishEvent (orgsWithExpiredTrials) {
      orgsWithExpiredTrials.forEach(org => {
        rabbitmq.publishEvent('organization.trial.ended', {
          id: org.id,
          name: org.name
        })
      })
    })
    .tap(function updateNotifiedTrialExpiredInStripe (orgsWithExpiredTrials) {
      const now = moment()
      return Promise.map(orgsWithExpiredTrials, org => {
        if (subscriptionIds[org.id]) {
          return stripe.updateSubsriptionWithTrialExipredNotification(org.stripeCustomerId, now.toISOSTring())
            .catch(logErrorAndKeepGoing)
        }
      })
    })
    .return() //  Don't return the orgs
    .catch(errorHandler)
}
