'use strict'

const Promise = require('bluebird')
const stripeClient = require('stripe')(process.env.STRIPE_API_KEY)

const logger = require('util/logger').child({ module: 'stripe' })
const runnableClient = require('util/runnable-api-client')

const MINIMUM_NUMBER_OF_USERS_IN_PLAN = 3

/**
 * These plan are stored in Stripe, but Stripe plans how no knowledge of
 * how many configurations a plan can have
 *
 * @param {Number} key    - Maximum number of configurations allowed per plan
 * @param {String} planId - Plan id in Stripe
 */
const PLANS = {
  2: 'runnable-basic',
  7: 'runnable-standard',
  99999999: 'runnable-plus'
}

module.exports = class Stripe {

  /**
   * Create customer and subscription in Stripe. The plan assigned to the
   * organization is determined by the number of instances they currently have
   *
   * @param {Object}         org              - Big Poppa organization. Presumes org is up-to-date.
   * @param {Number}         org.id           - Big Poppa Id
   * @param {Number}         org.githubId     - Github ID for organization
   * @param {Array<Object>}  org.users        - Array of all users in organization
   * @resolves {Object}      res              - Response object
   * @resolves {Object}      res.customer     - Stripe customer object
   * @resolves {Object}      res.subscription - Stripe subscription object
   * @returns {Promise}
   */
  static createCustomerAndSubscriptionForOrganization (org) {
    const log = logger.child({ method: 'Stripe.createCustomer', org: org })
    log.info('Stripe.createCustomer called')
    return Promise.props({
      planId: Stripe.getPlanIdForOrganizationBasedOnCurrentUsage(org.githubId),
      stripeCustomer: Stripe._createCustomer(org)
    })
      .then(function createSubscriptionForCustomer (res) {
        log.trace({ planId: res.planId, users: org.users }, 'createSubscriptionForCustomer')
        return Stripe._createSubscription(res.stripeCustomer.id, org.users, res.planId)
          .then(function (stripeSubscription) {
            return {
              customer: res.stripeCustomer,
              subscription: stripeSubscription
            }
          })
      })
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
    const log = logger.child({ method: 'Stripe.updateCustomer', org: org })
    log.info('Stripe.updateUsersInPlan called')
    return Stripe.getSubscriptionForOrganization(org.stripeCustomerId)
      .then(function updateCustomerInStripe (subscription) {
        log.trace({ subscription: subscription }, 'updateCustomerInStripe')
        return Stripe._updateUsersForPlan({
          subscriptionId: subscription.id,
          users: org.users
        })
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
    const log = logger.child({ method: 'Stripe.getPlanIdForOrganizationBasedOnCurrentUsage', orgGithubId: orgGithubId })
    log.info('getPlanIdForOrganizationBasedOnCurrentUsage called')
    return runnableClient.getAllInstancesForUserByGithubId(orgGithubId)
      .then(function determinePlan (instances) {
        let numberOfInstances = instances.length
        log.trace({ instances: numberOfInstances }, 'Fetched instances')
        let allowedPlans = Object.keys(PLANS).filter(function filterKeys (numberOfInstancesAllowedByPlan) {
          return numberOfInstances <= numberOfInstancesAllowedByPlan
        })
        log.trace({ allowedPlans: allowedPlans }, 'allowedPlans')
        let organizationPlanKey = Math.min.apply(null, allowedPlans)
        log.trace({ organizationPlanKey: organizationPlanKey, plan: PLANS[organizationPlanKey] }, 'organizationPlanKey')
        return PLANS[organizationPlanKey]
      })
  }

  /**
   * Create a customer in Stripe
   *
   * @param {Object}     org            - Big Poppa organization. Presumes org is up - to - date.
   * @param {Number}     org.id         - Big Poppa Id
   * @param {Number}     org.githubId   - Github ID for organization
   * @resolves {Object}  stipreCustomer - Stripe customer object
   * @returns {Promise}
   */
  static _createCustomer (org) {
    const log = logger.child({ org: org }, 'Stripe._createCustomer')
    log.info('Stripe._createCustomer called')
    return stripeClient.customers.create({
      description: `Customer for organizationId: ${org.id} / githubId: ${org.githubId}`,
      metadata: {
        organizationId: org.id,
        githubId: org.githubId
      }
    })
  }

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
    }, Stripe._getUpdateObjectForUsers(users))
    log.trace({ createObject: createObject }, 'Creating subscription')
    return stripeClient.subscriptions.create(createObject)
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
      Stripe._getUpdateObjectForUsers(planUsers)
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
    let planUsers = Stripe._generatePlanUsersForOrganization(users || [])
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
   * Generate array to be passed to Stripe API from array of Big Poppa users
   *
   * @param {Array<Object>}           users - Array of Big poppa users
   * @returns {Array<String|Number>}        - Array of Github IDs or String
   */
  static _generatePlanUsersForOrganization (users) {
    const log = logger.child({ users: users }, '_generatePlanUsersForOrganization')
    log.info('_generatePlanUsersForOrganization called')
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
   * Get subscription for organization
   *
   * @param {String}     orgStripeCustomerId - Stripe Customer ID
   * @resolves {Object}  subscription        - Stripe subscription object
   * @returns {Promise}
   */
  static getSubscriptionForOrganization (orgStripeCustomerId) {
    const log = logger.child({ orgStripeCustomerId: orgStripeCustomerId }, 'getSubscriptionForOrganization')
    log.info('getSubscriptionForOrganization called')
    return stripeClient.subscriptions.list({ limit: 1, customer: orgStripeCustomerId })
      .then(res => {
        let subscriptions = res.data
        log.trace({ subscriptions: subscriptions }, 'Subscriptions received from Stripe')
        if (subscriptions.length === 0) {
          throw new Error('No subscription found for organization')
        }
        return subscriptions[0]
      })
  }
}
