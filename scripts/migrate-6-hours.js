'use strict'
require('loadenv')()

const bigPoppa = require('util/big-poppa')
const stripe = require('util/stripe')
const moment = require('moment')

/**
 * Currently, we add a gap of 6 hours between the trial end in the subscription
 * and the trial end in BP. This is because it takes 1-2 hours for Stripe
 * to invoice and charge the customer so we want to avoid kicking out paying
 * customer who's invoices have just not gone through.
 *
 * This script syncs up the `trialEnd` property in the database
 */

const logger = require('util/logger').child({ module: 'sync-6-hour-diff' })
// Dry run by default
const DRY_RUN = !!process.env.DRY_RUN === 'false'

const orgsUpdated = []
const orgsNotUpdated = []

const now = moment()
const log = logger.child({ now: now.toISOString(), DRY_RUN, DRY_TYPE: typeof DRY_RUN })
log.info('Starting script')
bigPoppa.getOrganizations({
  trialEnd: { moreThan: now.toISOString() }
})
.map(function (org) {
  var _log = log.child({ orgId: org.id, stripeCustomerId: org.stripeCustomerId, orgName: org.name })
  return stripe.getSubscriptionForOrganization(org.stripeCustomerId)
    .then(function (subscription) {
      _log.trace('Found subscritpion')
      let periodEnd = moment(subscription.trial_end, 'X')
      let trialEnd = moment(org.trialEnd)
      console.log('TRIAL END', trialEnd.toISOString())
      let diffInHours = periodEnd.diff(trialEnd, 'hours', true)
      _log.trace({
        diffInHours,
        periodEnd: periodEnd.toISOString(),
        trialEnd: trialEnd.toISOString()
      }, 'Check time diff')
      if (diffInHours > -6) {
        let newTrialEnd = periodEnd.clone().add(6, 'hours')
        _log.trace({ newTrialEnd: newTrialEnd.toISOString() }, 'Updating BP')
        orgsUpdated.push(org.id)
        if (!DRY_RUN) {
          log.trace('Updating the database. This it not a dry run.')
          return bigPoppa.updateOrganization(org.id, { trialEnd: newTrialEnd.toISOString() })
        }
        return true
      }
      orgsNotUpdated.push(org.id)
      log.trace('Not updating `trialEnd`')
      return false
    })
})
.then(() => {
  log.trace({
    orgsUpdated,
    orgsNotUpdated,
    numberOfOrgsUpdated: orgsUpdated.length,
    numberOfOrgsNotUpdated: orgsNotUpdated.length
  }, 'Orgs updated. Finished.')
})
