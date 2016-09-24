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

  /**
   * Get all orgs that:
   * 1. Have a payment method
   * 2. Have a Stripe customer ID
   * 3. Are in their grace period
   * 4. Have been in their grace period for 24 hours
   *
   * @resolves {Array<Object>} - Array of organizations
   * @returns {Promise}
   */
  static getAllOrgsWithPaymentMethodInLast48HoursOfGracePeriod () {
    const log = logger.child()
    log.info('getFilteredOrgsInTrialByTrialEndTime')
    const now = moment()
    const twentyFourHoursAgo = now.clone().subtract(24, 'hours')
    return bigPoppa.getOrganizations({
      hasPaymentMethod: true,
      stripeCustomerId: { isNull: false },
      trialEnd: { lessThan: now.toISOString() },
      activePeriodEnd: { lessThan: now.toISOString() },
      gracePeriodEnd: { moreThan: now.toISOString() }
    })
    .tap(organizations => {
      log.trace({ organizations }, 'Organizations in last 48 hours of Grace Period')
    })
    .filter(function fiterToOrgsWith24hoursInGP (org) {
      const trialEnd = moment(org.trialEnd)
      const activePeriodEnd = moment(org.activePeriodEnd)
      return trialEnd.isAfter(twentyFourHoursAgo) || activePeriodEnd.isAfter(twentyFourHoursAgo)
    })
  }
}
