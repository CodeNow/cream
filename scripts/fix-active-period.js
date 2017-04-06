'use strict'
require('loadenv')()

const Promise = require('bluebird')

const bigPoppa = require('util/big-poppa')
const stripe = require('util/stripe')
const moment = require('moment')

// DRY RUN BY DEFAULT
const isDryRun = process.env.DRY_RUN !== 'false'
const log = require('util/logger').child({ module: 'scripts/fix-active-period', isDryRun })

let orgIds = []
let orgsSuccsefullyUpdated = []

const logOrgs = (message) => {
  return (orgs) => log.trace({ orgIds: orgs.map(x => x.id), numberOfOrgs: orgs.length }, message)
}

Promise.resolve()
  .then(function getAllOrgs () {
    log.info('getAllOrgs')
    return bigPoppa.getOrganizations({})
  })
  .tap(logOrgs('All orgs'))
  .filter(function compareTrialAndActive (org) {
    let trialEnd = +moment(org.trialEnd).subtract(6, 'hours').format('X')
    let activePeriodEnd = +moment(org.activePeriodEnd).format('X')
    log.trace({ orgId: org.id, trialEnd, activePeriodEnd }, 'Check timestamps')
    return trialEnd === activePeriodEnd // || trialEnd < activePeriodEnd
  })
  .tap(logOrgs('Orgs with same trial as active period'))
  .filter(function getSubscription (org) {
    orgIds.push(org.id)
    log.trace({ orgId: org.id, stripeCustomerId: org.stripeCustomerId }, 'Fetch subscription')
    return stripe.getSubscriptionForOrganization(org.stripeCustomerId)
      .then(sub => { org.subscription = sub })
      .return(true)
      .catch(err => {
        log.trace({ err, orgId: org.id, stripeCustomerId: org.stripeCustomerId }, 'No subscription found')
        return false
      })
  })
  .tap(logOrgs('Orgs with subscriptions'))
  .filter(function filterOutOrgNotInTrial (org) {
    log.trace({ subscription: org.subscription, orgId: org.id }, 'Subscription for org')
    return org.subscription.status === 'trialing'
  })
  .tap(logOrgs('Orgs that are trialing'))
  .map(function updateOrg (org) {
    let newActivePeriodEnd = moment(org.createdAt)
    orgsSuccsefullyUpdated.push(org.id)
    let activePeriodEnd = +moment(org.activePeriodEnd).format('X')
    let activePeriodEndInSubscription = org.subscription.current_period_end
    let trialEndInSubscription = org.subscription.trial_end
    log.trace({ activePeriodEnd, activePeriodEndInSubscription, trialEndInSubscription, orgId: org.id, org }, 'All timestamps')
    if (isDryRun) {
      return true
    }
    log.trace('Actually updating subscription')
    return bigPoppa.updateOrganization(org.id, { activePeriodEnd: newActivePeriodEnd.toISOString() })
  })
  .then(() => {
    log.info({
      numberOfOrgs: orgIds.length,
      numberOfUpdatedOrgs: orgsSuccsefullyUpdated.length,
      orgIds,
      orgsSuccsefullyUpdated
    }, 'Finished')
  })

