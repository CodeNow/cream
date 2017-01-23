'use strict'

const Promise = require('bluebird')
const monitorDog = require('monitor-dog')
const keypather = require('keypather')()

const stripeClient = require('util/stripe/client')
const runnableAPI = require('util/runnable-api-client')
const logger = require('util/logger').child({ module: 'stripe/invoice' })

const ValidationError = require('errors/validation-error')
const StripeErrorHandler = require('util/stripe/error-handler')

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
   * @param {Boolean}        noTrial          - Do not give this subscription a trial
   * @resolves {Object}      subscription     - Stripe subscription object
   * @returns {Promise}
   */
  static createSubscription (stripeCustomerId, users, planId, opts) {
    const log = logger.child({ stripeCustomerId: stripeCustomerId, users, planId, opts }, 'Stripe.createSubscription')
    log.info('Stripe.createSubscription called')
    let createObject = Object.assign({
      customer: stripeCustomerId,
      plan: planId // The quantity always needs to be updated when updating a plan
    }, StripeSubscriptionUtils._getUpdateObjectForUsers(users))
    if (keypather.get(opts, 'noTrial')) {
      createObject.trial_end = 'now'
    }
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
  static get (orgStripeSubscriptionId) {
    const log = logger.child({ orgStripeSubscriptionId })
    log.info('get called')
    return Promise.try(function () {
      if (!orgStripeSubscriptionId || !orgStripeSubscriptionId.match(/^sub_/)) {
        throw new ValidationError('The provided subscription ID is invalid', { orgStripeSubscriptionId })
      }
      const timer = monitorDog.timer('subscritption.get', true, { orgStripeSubscriptionId })
      return stripeClient.subscriptions.retrieve(orgStripeSubscriptionId)
        .finally(() => timer.stop())
    })
      .catch(StripeErrorHandler)
  }

  /**
   * Update plan ID for organization, based on current usage. Fetches number
   * of instances using the Runnable API Client and determines the current
   * plan based on that.
   *
   * Re-updates the number of users and makes sure the new subscription is not
   * in a trial.
   *
   * @param {Object}     org - Organization object
   * @returns {Promise}
   */
  static updatePlanIdForOrganizationBasedOnCurrentUsage (org) {
    const log = logger.child({ org: org })
    log.info('Stripe.updatePlanIdForOrganizationBasedOnCurrentUsage called')
    return StripeSubscriptionUtils.getPlanIdForOrganizationBasedOnCurrentUsage(org.githubId)
      .then(function updateCustomerInStripe (plan) {
        log.trace({ org, plan }, 'Fetched plan')
        // The quantity always needs to be updated when updating a plan
        // By default, the subscription will go into trial. We want to always
        // avoid this.
        const updates = Object.assign({ plan, trial_end: 'now' },
          StripeSubscriptionUtils._getUpdateObjectForUsers(org.users)
        )
        return stripeClient.subscriptions.update(
          org.stripeSubscriptionId,
          updates
       )
        .catch(StripeErrorHandler)
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
    return runnableAPI.getAllNonTestingInstancesForUserByGithubId(orgGithubId)
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
    const log = logger.child({ users }, 'generatePlanUsersForOrganization')
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
   * @param {Object}         org                      - Big Poppa organization. Presumes org is up - to - date.
   * @param {Number}         org.stripeSubscriptionId - Stripe subscription ID for organization
   * @param {Array<Object>}  org.users                - Array of all users in organization
   * @resolves {Object}      subscription             - Subscription object returned by Stripe
   * @returns {Promise}
   */
  static updateUsersForPlan (org) {
    const methodName = 'Stripe.subscriptions.updateUsersForPlan'
    const log = logger.child({ subscriptionId: org.stripeSubscriptionId, planUsers: org.users }, methodName)
    log.info('updateUsersForPlan called')
    const timer = monitorDog.timer(methodName, true, { stripeSubscriptionId: org.stripeSubscriptionId })
    return stripeClient.subscriptions.update(
      org.stripeSubscriptionId,
      StripeSubscriptionUtils._getUpdateObjectForUsers(org.users)
    )
    .catch(StripeErrorHandler)
    .finally(() => timer.stop())
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
        users: JSON.stringify(planUsers).substring(0, 499),
        environment: process.env.NODE_ENV
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
  static updateWithTrialEndedNotification (stripeSubscriptionId, notificationSentTime) {
    const methodName = 'Stripe.subscriptions.updateWithTrialEndedNotification'
    const log = logger.child({ stripeSubscriptionId, notificationSentTime }, methodName)
    log.info('Stripe.updateWithTrialEndedNotification called')
    const updates = {
      metadata: {
        notifiedTrialEnded: notificationSentTime
      }
    }
    const timer = monitorDog.timer(methodName, true, { stripeSubscriptionId })
    return stripeClient.subscriptions.update(stripeSubscriptionId, updates)
     .catch(StripeErrorHandler)
     .finally(() => timer.stop())
  }

  /**
   * Update the subscription with the `notifiedTrialEnding` property
   *
   * @param {String}       stripeSubscripionId  - Subscription ID in Stripe
   * @param {String}       notificationSentTime - ISO8601 timestamp
   * @resolves {Object}                         - Stripe subscription
   * @returns {Promise}
   */
  static updateWithTrialEndingNotification (stripeSubscriptionId, notificationSentTime) {
    const methodName = 'Stripe.subscriptions.updateWithTrialEndingNotification'
    const log = logger.child({ stripeSubscriptionId, notificationSentTime }, methodName)
    log.info('Stripe.updateWithTrialEndingNotification called')
    const updates = {
      metadata: {
        notifiedTrialEnding: notificationSentTime
      }
    }
    const timer = monitorDog.timer(methodName, true, { stripeSubscriptionId })
    return stripeClient.subscriptions.update(stripeSubscriptionId, updates)
     .catch(StripeErrorHandler)
     .finally(() => timer.stop())
  }
}
module.exports.PLANS = PLANS
