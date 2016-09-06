'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))
const moment = require('moment')
const keypather = require('keypather')()
const pluck = require('101/pluck')

const TrialService = require('services/trial-service')
const stripe = require('util/stripe')
const util = require('util/index')
const log = require('util/logger').child({ module: 'worker/organization.trial.ending.check' })
const rabbitmq = require('util/rabbitmq')

const errorHandler = require('workers/error-handler')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
const jobSchema = Joi.object({
  tid: Joi.string().guid()
}).required()

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
 * @param {Number}    job.githubId - Github ID for new User
 * @return {Promise}
 */
module.exports = function CheckForOrganizationsWithEndingTrials (job) {
  log.info('CheckForOrganizationsWithEndingTrials called')

  return Joi.validateAsync(job, jobSchema)
  .then(function fetchAllOrganizations (job) {
    log.trace('Fetching all organizations')
    // Get all organizations whose trial ends in 72 hours
    const now = moment().add(72, 'hours')
    return TrialService.getAllOrgsInTrialByTrialEndTime(now)
  })
  .then(function filterAlreadyNotified (organizationWithEndingTrialsAndNoPaymentMethod) {
    return organizationWithEndingTrialsAndNoPaymentMethod.filter(org => {
      return !pluck(org, 'subscription.metadata.notifiedTrialEnding')
    })
  })
  .tap(function publishEvent (orgsWithEndingTrials) {
    orgsWithEndingTrials.forEach(org => {
      rabbitmq.publishEvent('organization.trial.ending', {
        organization: {
          id: org.id,
          name: org.name
        }
      })
    })
  })
  .tap(function updateNotifiedTrialEndingInStripe (orgsWithEndingTrials) {
    const now = moment()
    return Promise.map(orgsWithEndingTrials, org => {
      if (keypather.get(org, 'subscription.id')) {
        return stripe.updateSubsriptionWithTrialEndingNotification(org.subscription.id, now.toISOString())
          .catch(util.logErrorAndKeepGoing({ org }, 'Error updating subscription for org'))
      }
    })
  })
  // For logging purposes
  .then(organizations => organizations.map(pluck('id')))
  .catch(errorHandler)
}
