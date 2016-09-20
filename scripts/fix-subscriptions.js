
'use strict'
require('loadenv')()

const Promise = require('bluebird')
const moment = require('moment')

const bigPoppa = require('util/big-poppa')
const stripe = require('util/stripe')
const runnableAPI = require('util/runnable-api-client')

// DRY RUN BY DEFAULT
const isDryRun = process.env.DRY_RUN !== 'false'
const log = require('util/logger').child({ module: 'scripts/fix-subscription', isDryRun })

let orgIds = []
let orgsSuccsefullyUpdated = []

const logOrgs = (message) => {
  return (orgs) => log.trace({ orgIds: orgs.map(x => x.id), numberOfOrgs: orgs.length }, message)
}

Promise.resolve()
  .then(() => runnableAPI.login())
  .then(function getAllOrgs () {
    log.info('getAllOrgs')
    return bigPoppa.getOrganizations({})
  })
  .tap(logOrgs('All orgs'))
  .filter(function getSubscription (org) {
    orgIds.push(org.name)
    log.trace({ orgId: org.id, stripeCustomerId: org.stripeCustomerId }, 'Fetch subscription')
    return stripe.getSubscriptionForOrganization(org.stripeCustomerId)
      .then(sub => { org.subscription = sub })
      .return(false)
      .catch(err => {
        log.trace({ err, orgId: org.id, stripeCustomerId: org.stripeCustomerId }, 'No subscription found')
        return true
      })
  })
  .tap(logOrgs('Orgs with no subscriptions'))
  .filter(function createNewSubscription (org) {
    return stripe.getPlanIdForOrganizationBasedOnCurrentUsage(org.githubId)
      .then(planId => { org.planId = planId })
      .return(true)
      .catch(() => {
        log.error({ org }, 'No plan found for organization')
        return false
      })
  })
  .tap(logOrgs('Orgs with plans'))
  .map(function createNewSubscription (org) {
    let trialEnd = moment().add(1, 'minute')
    let createObject = Object.assign({
      customer: org.stripeCustomerId,
      plan: org.planId,
      trial_end: +trialEnd.format('X')
    }, stripe._getUpdateObjectForUsers(org.users))
    createObject.metadata.subscriptionCreatedAfterDeleted = trialEnd.toISOString()
    log.trace({ createObject, org }, 'Creating subscription')
    orgsSuccsefullyUpdated.push(org.name)
    if (isDryRun) {
      return true
    }
    log.trace('Actually updating subscription')
    return stripe.stripeClient.subscriptions.create(createObject)
  })
  .then(() => runnableAPI.logout())
  .then(() => {
    log.info({
      numberOfOrgs: orgIds.length,
      numberOfUpdatedOrgs: orgsSuccsefullyUpdated.length,
      orgIds,
      orgsSuccsefullyUpdated
    }, 'Finished')
  })
