'use strict'

const Promise = require('bluebird')
const moment = require('moment')

const stripe = require('util/stripe')
const util = require('util/index')
const bigPoppa = require('util/big-poppa')
const logger = require('util/logger').child({ module: 'TrialService' })

module.exports = class TrialService {

  static getFilteredOrgsInTrialByTrialEndTime (endTime) {
    const log = logger.child({ endTime })
    log.info('getFilteredOrgsInTrialByTrialEndTime')
    return bigPoppa.getOrganizations({
      hasPaymentMethod: false
    })
    .then(function filterOrganizationsWithEndedTrials (organizations) {
      return organizations.filter(org => {
        const trialEnd = moment(org.trialEnd)
        return endTime.isAfter(trialEnd) && org.stripeCustomerId
      })
    })
    .then(function filterAlreadyNotified (organizationWithEndedTrialsAndNoPaymentMethod) {
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
}
