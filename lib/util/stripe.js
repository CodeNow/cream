'use strict'

const Promise = require('bluebird')
const keypather = require('keypather')()
const stripeClient = require('stripe')(process.env.STRIPE_API_KEY)
const Joi = Promise.promisifyAll(require('joi'))

const logger = require('util/logger').child({ module: 'stripe' })
const runnableClient = require('util/runnable-api-client')

const MINIMUM_NUMBER_OF_USERS_IN_PLAN = 3

const PLANS = {
  2: 'runnable-basic',
  7: 'runnable-standard',
  15: 'runnable-plus',
  Infinity: 'runnable-premium'
}

const updateUsersForPlanSchema = Joi.object({
  subscriptionId: Joi.string().required().regex(/^sub_/),
  planUsers: Joi.array().items(Joi.string())
})

module.exports = class Stripe {

  static createCustomer (org, planId) {
    const log = logger.child({ method: 'Stripe.createCustomer', org: org, planId: planId })
    log.info('Stripe.createCustomer called')
    return Promise.resolve()
      .then(function createCustomerAndAssignPlan (planId) {
        return stripeClient.customers.create({
          description: `Customer for organizationId: ${org.id} / githubId: ${org.githubId}`,
          metadata: {
            organizationId: org.id,
            githubId: org.githubId
          }
        })
      })
      .then(function fetchPlanMetadata (stripeCustomer) {
        log.trace({ stripeCustomer: stripeCustomer }, 'fetchPlanMetadata')
        return Promise.props({
          planId: Stripe.getPlanIdForOrganization(org.githubId),
          stripeCustomer: stripeCustomer
        })
      })
      .then(function createSubscriptionForCustomer (res) {
        log.trace({ planId: res.planId, users: org.users }, 'createSubscriptionForCustomer')
        let planUsers = Stripe.getPlanUsersForOrganization(org.users || [])
        log.trace({ users: planUsers }, 'Determine plan users')
        return stripeClient.subscriptions.create({
          customer: res.stripeCustomer.id,
          plan: res.planId,
          quantity: planUsers.length,
          // coupon: null, // Add coupon if it exists
          metadata: {
            // Must be a string under 500 characters
            users: JSON.stringify(planUsers)
          }
        })
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
          planUsers: Stripe.getPlanUsersForOrganization(org.users || [])
        })
      })
  }

  static _updateUsersForPlan (opts) {
    return Joi.validateAsync(opts, updateUsersForPlanSchema, { stripUnknown: true })
      .then(function updateUsersForPlan () {
        let updates = {
          quantity: opts.planUsers.length,
          metadata: {
           // Must be a string under 500 characters
            users: JSON.stringify(opts.planUsers)
          }
        }
        return stripeClient.subscriptions.update(
          opts.subscriptionId,
          updates
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

  static getPlanUsersForOrganization (users) {
    const log = logger.child({ users: users }, 'getPlanUsersForOrganization')
    log.info('getPlanUsersForOrganization called')
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

  static getEvent (stripeEventId) {
    return stripeClient.events.retrieve(stripeEventId)
  }

  static getPlanIdForOrganization (orgGithubId) {
    const log = logger.child({ method: 'Stripe.getPlanIdForOrganization', orgGithubId: orgGithubId })
    log.info('getPlanIdForOrganization called')
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
