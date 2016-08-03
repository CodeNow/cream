'use strict'

const keypather = require('keypather')()
const stripeClient = require('stripe')(process.env.STRIPE_API_KEY)

const logger = require('util/logger').child({ module: 'stripe' })
const runnableClient = require('util/runnable-api-client')

const MINIMUM_NUMBER_OF_USERS_IN_PLAN = 3
const PLANS = {
  2: 'runnable-basic',
  7: 'runnable-standard',
  15: 'runnable-plus',
  Infinity: 'runnable-premium'
}

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
        return Stripe.getPlanForOrganization(org.githubId)
          .then(function (planId) {
            log.trace('RETURN OBJE')
            var a = {
              planId: planId,
              stripeCustomer: stripeCustomer
            }
            log.trace({ a: a }, '!!!')
            return a
          })
      })
      .then(function createSubscriptionForCustomer (res) {
        log.trace({ planId: res.planId, users: org.users }, 'createSubscriptionForCustomer !!!')
        console.log('!!!!!!', org.users)
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

  static getPlanUsersForOrganization (users) {
    const log = logger.child({ users: users }, 'getPlanForOrganization')
    log.trace('getPlanUsersForOrganization 1')
    let minAmountOfUsers = Math.max(users.length, MINIMUM_NUMBER_OF_USERS_IN_PLAN)
    log.trace({ minAmountOfUsers: minAmountOfUsers }, 'getPlanUsersForOrganization 1.1')
    let planUsers = []
    log.trace('getPlanUsersForOrganization 2')
    for (var i = 0; i < minAmountOfUsers; i++) {
      let userGithubId = keypather.get(users, '[i].githubId')
      if (userGithubId) {
        planUsers.push(userGithubId)
      } else {
        planUsers.push('AUTOMATICALLY_ADDED_USER')
      }
    }
    log.trace('getPlanUsersForOrganization 3')
    return planUsers
  }

  // static updatePlanForCustomer (org) {
    // log.trace('No `planId` specified. Fetching number of instances')
      // .then(function planName)
  // }

  static retrieveEvent (stripeEventId) {
    return stripeClient.events.retrieve(stripeEventId)
  }

  static getPlanForOrganization (orgGithubId) {
    const log = logger.child({ method: 'Stripe.getPlanForOrganization', orgGithubId: orgGithubId })
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
