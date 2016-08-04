'use strict'

const Promise = require('bluebird')
const stripeClient = require('stripe')(process.env.STRIPE_API_KEY)
const Joi = Promise.promisifyAll(require('joi'))

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

const updateUsersForPlanSchema = Joi.object({
  subscriptionId: Joi.string().required().regex(/^sub_/),
  planUsers: Joi.array().items(Joi.object({
    githubId: Joi.number().required()
  }))
})

module.exports = class Stripe {

  static createCustomer (org, planId) {
    const log = logger.child({ method: 'Stripe.createCustomer', org: org, planId: planId })
    log.info('Stripe.createCustomer called')
    return Promise.props({
      planId: Stripe.getPlanIdForOrganizationBasedOnCurrentUsage(org.githubId),
      stripeCustomer: Stripe._createCustomer(org)
    })
      .then(function createSubscriptionForCustomer (res) {
        log.trace({ planId: res.planId, users: org.users }, 'createSubscriptionForCustomer')

        let createObject = Object.assign({
          customer: res.stripeCustomer.id,
          plan: res.planId
        }, Stripe._getUpdateObjectForUsers(org.users))

        log.trace({ createObject: createObject }, 'Object for creating customer')
        return stripeClient.subscriptions.create(createObject)
          .then(function (stripeSubscription) {
            return {
              customer: res.stripeCustomer,
              subscription: stripeSubscription
            }
          })
      })
  }

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

  static _createCustomer (org) {
    return stripeClient.customers.create({
      description: `Customer for organizationId: ${org.id} / githubId: ${org.githubId}`,
      metadata: {
        organizationId: org.id,
        githubId: org.githubId
      }
    })
  }

  static _updateUsersForPlan (opts) {
    return Joi.validateAsync(opts, updateUsersForPlanSchema, { stripUnknown: true })
      .then(function updateUsersForPlan (validatedOpts) {
        return stripeClient.subscriptions.update(
          validatedOpts.subscriptionId,
          Stripe._getUpdateObjectForUsers(validatedOpts.users)
        )
      })
  }

  static getSubscriptionForOrganization (orgStripeCustomerId) {
    const log = logger.child({ orgStripeCustomerId: orgStripeCustomerId }, 'getSubscriptionForOrganization')
    log.info('getSubscriptionForOrganization called')
    return stripeClient.subscriptions.list({ limit: 1, customer: orgStripeCustomerId })
      .then(res => {
        let subscriptions = res.data
        log.info({ subscriptions: subscriptions }, 'subscriptions received fromo Stripe')
        if (subscriptions.length === 0) {
          throw new Error('No subscription found for organization')
        }
        return subscriptions[0]
      })
  }

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

}
