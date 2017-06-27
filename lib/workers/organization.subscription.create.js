'use strict'

const Promise = require('bluebird')
const Joi = require('util/joi')
const stripe = require('util/stripe')
const bigPoppa = require('util/big-poppa')

const rabbitmq = require('util/rabbitmq')
const logger = require('util/logger').child({ module: 'worker/organization.subsciption.create' })
const errorHandler = require('workers/error-handler')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
module.exports.jobSchema = Joi.object({
  organization: Joi.object({
    id: Joi.number().required()
  }).required()
}).unknown().required()

/**
 * When a subscription is 'unpaid' and a customer puts in their payment method,
 * we want to create a new subscription
 *
 * @param {Object}    job                 - job passed by RabbitMQ
 * @param {Number}    job.organization.id - Organization BP Id
 * @return {Promise}
 */
module.exports.task = function CreateNewSubscriptionForExistingOrganization (job) {
  const log = logger.child({ job })
  // 1. Fetch organization
  return bigPoppa.getOrganization(job.organization.id)
  .then(org => {
    log.trace({ org }, 'Organization fetched. Creating subscription')
    // 2. Create new subscription using stripe Customer id with trial_end = 'now'
    return Promise.props({
      org,
      subscription: stripe.createNewSubscriptionForCustomerWithPaymentMethod(org)
    })
  })
  // 3. Pay new invoice (do we need to pay it?) It might already be paid when we create it
  .tap(res => {
    const subscription = res.subscription
    // 4. Update organization with new subscription id
    log.trace({ subscription }, 'Subscription created. Updating organization')
    return bigPoppa.updateOrganization(job.organization.id, {
      stripeSubscriptionId: subscription.id,
      // We always want an org to be active if they are a paying organization
      isActive: true
    })
  })
  .tap(res => {
    const id = res.org.id
    const githubId = res.org.githubId
    const orgId = res.org.id
    const isPersonalAccount = res.org.isPersonalAccount
    rabbitmq.publishEvent('organization.allowed', { id, githubId, orgId, isPersonalAccount })
  })
  .tap(res => {
    const subscription = res.subscription
    const newJob = Object.assign({}, job, {
      subscription
    })
    rabbitmq.publishEvent('organization.subscription.created', newJob)
  })
  .catch(errorHandler)
}
