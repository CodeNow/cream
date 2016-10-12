'use strict'

const Promise = require('bluebird')
const stripeClient = require('util/stripe/client')
const runnableAPI = require('util/runnable-api-client')
const logger = require('util/logger').child({ module: 'stripe/invoice' })

const EntityNotFoundError = require('errors/entity-not-found-error')

const MINIMUM_NUMBER_OF_USERS_IN_PLAN = 3

/**
 * These plan are stored in Stripe, but Stripe plans how no knowledge of
 * how many configurations a plan can have
 *
 * This is the source of truth for the max number of configurations. Not Stripe.
 *
 * @param {String} key   - Plan id in Stripe
 * @param {Number} value - Maximum number of configurations allowed per plan
 */
const PLANS = {
  'runnable-starter': 2,
  'runnable-standard': 7,
  'runnable-plus': 99999
}

module.exports = class StripeSubscriptionUtils {

  /**
   * Create subscription in Stripe
   *
   * @param {String}         stripeCustomerId - Stripe customer ID for Big Poppa organization
   * @param {Array<Object>}  users            - Array of all users in organization
   * @param {String}         planId           - ID for Stripe plan (Should be part of `PLANS`)
   * @resolves {Object}      subscription     - Stripe subscription object
   * @returns {Promise}
   */
  static _createSubscription (stripeCustomerId, users, planId) {
    const log = logger.child({ stripeCustomerId: stripeCustomerId, users: users, planId: planId }, 'Stripe._createSubscription')
    log.info('Stripe._createSubscription called')
    let createObject = Object.assign({
      customer: stripeCustomerId,
      plan: planId
    }, StripeSubscriptionUtils._getUpdateObjectForUsers(users))
    log.trace({ createObject: createObject }, 'Creating subscription')
    return stripeClient.subscriptions.create(createObject)
  }

  /**
   * Get subscription for organization
   *
   * @param {String}     orgStripeCustomerId - Stripe Customer ID
   * @resolves {Object}  subscription        - Stripe subscription object
   * @returns {Promise}
   */
  static get (orgStripeCustomerId) {
    const log = logger.child({ orgStripeCustomerId: orgStripeCustomerId })
    log.info('get called')
    return stripeClient.subscriptions.list({ limit: 1, customer: orgStripeCustomerId })
      .then(res => {
        let subscriptions = res.data
        log.trace({ subscriptions: subscriptions }, 'Subscriptions received from Stripe')
        if (subscriptions.length === 0) {
          throw new EntityNotFoundError(
            'No subscription found for organization',
            { orgStripeCustomerId: orgStripeCustomerId, subscriptions: subscriptions }
          )
        }
        return subscriptions[0]
      })
  }

  /**
   * Update plan ID for organization, based on current usage. Fetches number
   * of instances using the Runnable API Client and determines the current
   * plan based on that.
   *
   * @param {Object}     org - Organization object
   * @returns {Promise}
   */
  static updatePlanIdForOrganizationBasedOnCurrentUsage (org) {
    const log = logger.child({ org: org })
    log.info('Stripe.updatePlanIdForOrganizationBasedOnCurrentUsage called')
    return Promise.all([
      StripeSubscriptionUtils.get(org.stripeCustomerId),
      StripeSubscriptionUtils.getPlanIdForOrganizationBasedOnCurrentUsage(org.githubId)
    ])
      .spread(function updateCustomerInStripe (subscription, planId) {
        log.trace({ subscription: subscription, planId: planId }, 'fetched customer and planId')
        return stripeClient.subscriptions.update(
          subscription.id,
          { plan: planId }
        )
      })
  }

  /**
   * Determine which plan an organization would have based on current number of
   * instances (queried through API)
   *
   * @param {Number}     orgGithubId - Organization Github ID
   * @resolves {String}  planId      - Name of Stripe plan
   * @returns {Promise}
   */
  static getPlanIdForOrganizationBasedOnCurrentUsage (orgGithubId) {
    const log = logger.child({ orgGithubId: orgGithubId })
    log.info('getPlanIdForOrganizationBasedOnCurrentUsage called')
    return runnableAPI.getAllInstancesForUserByGithubId(orgGithubId)
      .then(function determinePlan (instances) {
        let numberOfInstances = instances.length
        log.trace({ instances: numberOfInstances }, 'Fetched instances')
        // Sort plan by the number of instances allowed in each plan
        // (Object keys do not guarantee order)
        let planNames = Object.keys(PLANS).sort(function sortByNumberOfInstances (a, b) {
          return PLANS[a] - PLANS[b]
        })
        // Find the first plan where the number of instances is less or equal
        // to the number of instances allowed in that plan
        let selectedPlanName = planNames.find(function findPlanName (planName) {
          return numberOfInstances <= PLANS[planName]
        })
        log.trace({ selectedPlanName: selectedPlanName }, 'selectedPlanName')
        return selectedPlanName
      })
  }

  /**
   * Generate array to be passed to Stripe API from array of Big Poppa users
   *
   * @param {Array<Object>}           users - Array of Big poppa users
   * @returns {Array<String|Number>}        - Array of Github IDs or String
   */
  static generatePlanUsersForOrganization (users) {
    const log = logger.child({ users: users }, 'generatePlanUsersForOrganization')
    log.info('generatePlanUsersForOrganization called')
    let minAmountOfUsers = Math.max(users.length, MINIMUM_NUMBER_OF_USERS_IN_PLAN)
    log.trace({ minAmountOfUsers: minAmountOfUsers }, 'Minimum number of users')
    let planUsers = []
    for (var i = 0; i < minAmountOfUsers; i++) {
      let userGithubId = users[i] && users[i].githubId
      if (userGithubId) {
        planUsers.push(userGithubId)
      } else {
        planUsers.push('ADDED_USER_TO_MEET_MINIMUM')
      }
    }
    log.trace({ planUsers: planUsers }, 'Users set in plan')
    return planUsers
  }

  /**
   * Update the number of users in a plan for an organization. Also updates
   * the metadata object in the plan to reflect who those users are.
   *
   * @param {Object}         org                  - Big Poppa organization. Presumes org is up-to-date.
   * @param {Number}         org.stripeCustomerId - Stripe customer ID for organization
   * @param {Array<Object>}  org.users            - Array of all users in organization
   * @resolves {Object}      subscription         - Subscription object returned by Stripe
   * @returns {Promise}
   */
  static updateUsersForPlan (org) {
    const log = logger.child({ org: org })
    log.info('Stripe.updateUsersInPlan called')
    return StripeSubscriptionUtils.get(org.stripeCustomerId)
      .then(function updateCustomerInStripe (subscription) {
        log.trace({ subscription: subscription }, 'updateCustomerInStripe')
        return StripeSubscriptionUtils._updateUsersForPlan(subscription.id, org.users)
      })
  }

  /**
   * Update users in Plan for Stripe
   *
   * @param {String}         subscriptionId - Stripe Customer ID
   * @param {Array<Object>}  planUsers      - Array of Big poppa users
   * @resolves {Object}      subscription   - Stripe subscription object
   * @returns {Promise}
   */
  static _updateUsersForPlan (subscriptionId, planUsers) {
    const log = logger.child({ subscriptionId: subscriptionId, planUsers: planUsers }, 'Stripe._updateUsersForPlan')
    log.info('_updateUsersForPlan called')
    return stripeClient.subscriptions.update(
      subscriptionId,
      StripeSubscriptionUtils._getUpdateObjectForUsers(planUsers)
    )
  }

  /**
   * Create an object to be passed to the Stripe API in order to populate the
   * number of users and metadata about users in plan
   *
   * @param {Array<Object>}  users             - Array of Big Poppa users
   * @param {Array<Object>}  users[0].githubId - Github id for users
   * @returns {Object}
   */
  static _getUpdateObjectForUsers (users) {
    let planUsers = StripeSubscriptionUtils.generatePlanUsersForOrganization(users)
    return {
      quantity: planUsers.length,
      metadata: {
        // Must be a string under 500 characters
        // Stores Github IDs for approximately first 50 users
        users: JSON.stringify(planUsers).substring(0, 499)
      }
    }
  }

  /**
   * Update the subscription with the `notifiedTrialEnded` property
   *
   * @param {String}       stripeSubscripionId  - Subscription ID in Stripe
   * @param {String}       notificationSentTime - ISO8601 timestamp
   * @resolves {Object}                         - Stripe subscription
   * @returns {Promise}
   */
  static updateSubscriptionWithTrialEndedNotification (stripeSubscriptionId, notificationSentTime) {
    const log = logger.child({ stripeSubscriptionId: stripeSubscriptionId, notificationSentTime: notificationSentTime }, 'Stripe.updateCustomerTrialEnded')
    log.info('Stripe.updateSubscriptionWithTrialEndedNotification called')
    const updates = {
      metadata: {
        notifiedTrialEnded: notificationSentTime
      }
    }
    return stripeClient.subscriptions.update(stripeSubscriptionId, updates)
  }

  /**
   * Update the subscription with the `notifiedTrialEnding` property
   *
   * @param {String}       stripeSubscripionId  - Subscription ID in Stripe
   * @param {String}       notificationSentTime - ISO8601 timestamp
   * @resolves {Object}                         - Stripe subscription
   * @returns {Promise}
   */
  static updateSubscriptionWithTrialEndingNotification (stripeSubscriptionId, notificationSentTime) {
    const log = logger.child({ stripeSubscriptionId: stripeSubscriptionId, notificationSentTime: notificationSentTime }, 'Stripe.updateCustomerTrialEnded')
    log.info('Stripe.updateSubscriptionWithTrialEndingNotification called')
    const updates = {
      metadata: {
        notifiedTrialEnding: notificationSentTime
      }
    }
    return stripeClient.subscriptions.update(stripeSubscriptionId, updates)
  }
}
module.exports.PLANS = PLANS
