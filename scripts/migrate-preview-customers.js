'use strict'
require('loadenv')()

const Promise = require('bluebird')
const moment = require('moment')

const log = require('util/logger').child({ module: 'scripts/migrage-preview-customers' })
const bigPoppa = require('util/big-poppa')
const rabbitmq = require('util/rabbitmq')
const runnableAPI = require('util/runnable-api-client')

const UpdatePlan = require('workers/organization.plan.update')
const Stripe = require('util/stripe')

const isDryRun = process.env.DRY_RUN
const TIMESTAMP = process.env.TIMESTAMP // '2016-09-09T18:00:00.000Z'

if (!TIMESTAMP) {
  log.error('No TIMESTAMP supplied')
  process.exit()
}

let orgIds = []
let deleteStripeCustomerIds = []
let orgsSuccsefullyStartedInTrial = []
let orgsSuccsefullyUpdated = []

/**
 * Because we promised all preview customers we were not going to charge them
 * until 9/9 we have to end their subscription on Stripe and create a new one
 */

Promise.resolve()
  .then(function connectToRunnableAPIClient () {
    return Promise.all([
      rabbitmq.connect(),
      runnableAPI.login()
    ])
  })
  .then(function getAllOrgs () {
    log.info('getAllOrgs')
    return bigPoppa.getOrganizations({})
  })
  .filter(function getAllCustomresWithSpecificTrialEnd (org) {
    log.trace({ org: org }, 'getAllCustomresWithSpecificTrialEnd')
    // Get all customers with a trialEnd of ...
    return org.trialEnd === TIMESTAMP
  })
  .tap(function logOrgs (orgsToRestartTrial) {
    orgIds = orgsToRestartTrial.map(x => x.id)
    log.info({ orgIds: orgIds }, 'Orgs with set `trialEnd`')
  })
  .mapSeries(function removeStripeCustomerId (org) {
    log.trace({ org: org }, 'Remove `stripeCustomerId` for org')
    deleteStripeCustomerIds.push(org.stripeCustomerId)
    if (isDryRun) return org
    return Stripe.stripeClient.customers.retrieve(org.stripeCustomerId)
      .then(function deleteSubscription (stripeCustomer) {
        let subscriptionId = stripeCustomer.subscriptions.data[0].id
        return Stripe.stripeClient.subscriptions.del(subscriptionId)
      })
      .return(org)
  })
  .mapSeries(function createNewSubscription (org) {
    log.info({ org: org }, 'startTrialForAllOrgs')
    return Stripe.getPlanIdForOrganizationBasedOnCurrentUsage(org.githubId)
      .then(function setPlan (planId) {
        log.trace({ planId: planId, orgId: org.id, stripeCustomerId: org.stripeCustomerId }, 'Pland id for org')
        if (isDryRun) return org
        return Stripe._createSubscription(org.stripeCustomerId, org.users, planId)
        .then(function setNewSubscritpin (subscription) {
          if (isDryRun) return org
          let trialEndTimestamp = moment(subscription.trial_end, 'X')
          return bigPoppa.updateOrganization(org.id, {
            trialEnd: trialEndTimestamp.toISOString()
          })
        })
      })
      .return(org)
  })
  .mapSeries(function updateNumberOfUsersInOrg (org) {
    orgsSuccsefullyStartedInTrial.push(org.id)
    log.info({ org: org }, 'startTrialForAllOrgs')
    if (isDryRun) return org
    return UpdatePlan({
      organization: {
        id: org.id
      }
    })
      .tap(() => {
        orgsSuccsefullyUpdated.push(org.id)
      })
      .return(org)
  })
  .then(function logResults () {
    log.info({
      isDryRun: isDryRun,
      numberOfOrgs: orgIds.length,
      numberOfOrgsSuccsefullyInTrial: orgsSuccsefullyStartedInTrial.length,
      numberOfOrgsSuccsefullyUpdated: orgsSuccsefullyUpdated.length,
      orgIds: orgIds,
      orgsSuccsefullyStartedInTrial: orgsSuccsefullyStartedInTrial,
      orgsSuccsefullyUpdated: orgsSuccsefullyUpdated
    }, 'Migration completed')
  })
  .catch(err => {
    log.error({ err: err }, 'Error creating and updating users')
  })
  .finally(() => {
    log.info('Finished')
    process.exit()
  })
