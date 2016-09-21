'use strict'

const Promise = require('bluebird')
const moment = require('moment')

const stripe = require('util/stripe')
const util = require('util/index')
const bigPoppa = require('util/big-poppa')
const logger = require('util/logger').child({ module: 'OrganizationService' })

module.exports = class OrganizationService {

  /**
   * Get all orgs meet the following conditions:
   * - Have trials that end BEFORE `endTime`
   * - Dont have a payment method
   * - Have a Stripe subscription
   *
   * @param {String}             endTime - ISO8601 timestamp
   * @resolves {Array<Object>}   orgs    - Array of BP organizations
   * @return {Promise}
   */
  static getFilteredOrgsInTrialByTrialEndTime (endTime) {
    const log = logger.child({ endTime })
    log.info('getFilteredOrgsInTrialByTrialEndTime')
    return bigPoppa.getOrganizations({
      hasPaymentMethod: false,
      stripeCustomerId: { isNull: false },
      trialEnd: { lessThan: endTime }
    })
    .then(function filterAlreadyNotified (organizationWithEndedTrialsAndNoPaymentMethod) {
      log.trace({ organizationWithEndedTrialsAndNoPaymentMethod }, 'Organizations with trials expired after endTime')
      return Promise.filter(organizationWithEndedTrialsAndNoPaymentMethod, org => {
        return stripe.getSubscriptionForOrganization(org.stripeCustomerId)
          .catch(util.logErrorAndKeepGoing({ org }, 'Error getting subscription for organization'))
          .then(function handleStripeSubscription (stripeSubscription) {
            org.subscription = stripeSubscription
            return !!stripeSubscription
          })
      })
    })
  }

  static getAllOrgsWithSubscriptionsInLast48HoursOfGracePeriod () {
    const log = logger.child()
    log.info('getFilteredOrgsInTrialByTrialEndTime')
    const now = moment()
    const twentyFourHoursAgo = moment().subtract(24, 'hours')
    return bigPoppa.getOrganizations({
      hasPaymentMethod: false,
      stripeCustomerId: { isNull: false },
      trialEnd: { lessThan: twentyFourHoursAgo.toISOString() },
      activePeriodEnd: { lessThan: twentyFourHoursAgo.toISOString() },
      gracePeriodEnd: { lessThan: now.toISOString() }
    })
    .tap(organizations => {
      log.trace({ organizations }, 'Organizations in last 48 hours of Grace Period')
    })
  }
}
