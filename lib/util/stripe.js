'use strict'

const logger = require('util/logger').child({ module: 'stripe' })
const stripe = require('stripe')(process.env.STRIPE_API_KEY)
const runnableClient = require('lib/util')

// const PLANS = {
  // 'runnable-basic': 2,
  // 'runnable-standard': 7,
  // 'runnable-plus': 15,
  // 'runnable-premium': Infinity
// }

module.exports = class Stripe {

  createCustomer (org, numberOfInstances, planId) {
    const log = logger.child({ method: 'Stripe.createCustomer', org: org, planId: planId })
    log.info('Stripe.createCustomer called')
    return Promise.resolve()
      .then(function fetchInstances () {
        if (!planId) {
          log.trace('No `planId` specified. Fetching number of instances')
          return runnableClient.getAllInstancesForUserByGithubId(org.githubId)
          .then(function determinePlan (instances) {
            log.trace({ instances: instances }, 'Fetched instances')
            return 'runnable-basic'
          })
        }
        return planId
      })
      .then(function createCustomerAndAssignPlan (planId) {
        return stripe.customers.create({
          description: `Customer for organizationId: ${org.id} / githubId: ${org.githubId}`,
          metadata: {
            organizationId: org.id,
            githubId: org.githubId
          },
          // TODO: Set plan according to number of containers
          plan: planId || 'runnable-basic' // Should query API for the number of instances
          // TODO: Set quantity with number of users
        })
      })
  }

  retrieveEvent (stripeEventId) {
    return stripe.events.retrieve(stripeEventId)
  }

}
