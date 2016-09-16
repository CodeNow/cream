'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))
const moment = require('moment')
const keypather = require('keypather')()

const bigPoppa = require('util/big-poppa')
const logger = require('util/logger').child({ module: 'worker/organizations.invoice.payment-failed.check' })
const stripe = require('util/stripe')
const rabbitmq = require('util/rabbitmq')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
module.exports.jobSchema = Joi.object({
  tid: Joi.string().guid()
}).required()

const logOrganizations = (message, log) => {
  return (orgs) => log.trace({ orgs }, message)
}

/**
 * Check if the payment for an org has been failing for more than 24 hours
 *
 * This worker should do the following:
 *
 * 1. Check if payment has failed for more than 24 hours
 * 2. Check if the invoice is not marked with `paymentFailedCheck`
 *
 * If that's the case:
 *
 * 1. Emit a `organization.invoice.payment-failed` event (This should only
 * happen once per invoice so the stripe invoice should be marked with something
 * like a `paymentFailedCheck` property)
 *
 * @param {Object}    job          - job passed by RabbitMQ
 * @param {Number}    job.githubId - Github ID for new User
 * @return {Promise}
 */
module.exports.task = function CheckInvoicedPaymentFailed (job) {
  const log = logger.child({})
  log.info('CheckInvoicedPaymentFailed called')
  const now = moment()
  const twentyFourHoursAgo = now.clone().subtract(24, 'hours')
  const seventyTwoHoursFromNow = now.clone().add(72, 'hours')
  /**
   * Get all orgs that:
   * 1. Have a payment method
   * 2. Have a `stripeCustomerId`
   * 3. Are in their grace period
   * 4. Have been out of their trial for 24 hours
   */
  return bigPoppa.getOrganizations({
    hasPaymentMethod: true,
    stripeCustomerId: { isNull: false },
    trialEnd: { lessThan: twentyFourHoursAgo.toISOString() },
    gracePeriodEnd: { lessThan: seventyTwoHoursFromNow.toISOString() }
  })
  .tap(logOrganizations(log, 'Fetched organizations in grace period'))
  .filter(function fetchInvoiceForOrg (org) {
    return stripe.invoices.getLastInvoiceForCustomer(org)
      .then((invoice) => { // Throws if not found
        Object.assign(org, { invoice })
        return !!invoice
      })
      .catchReturn(false)
  })
  .tap(logOrganizations(log, 'Fetched organizations with invoices'))
  .filter(function filterAllNotifiedOrgs (org) {
    return keypather.get(org, 'invoice.metadata.notifiedAllUsersPaymentFailed')
  })
  .tap(logOrganizations(log, 'Filter out orgs already notified'))
  .filter(function fetchAllPaymentMethodOwner (org) {
    return stripe.getCustomerPaymentMethodOwner(org.stripeCustomerId)
    .then(paymentMethodOwner => { // Throws if not found
      Object.assign(org, { paymentMethodOwner })
      return !!paymentMethodOwner
    })
    .catchReturn(false)
  })
  .tap(logOrganizations(log, 'Fetched payment method owner'))
  .map(function updateInvoiceAndPublishEvent (org) {
    const invoiceId = org.invoice.id
    const paymentMethodOwnerId = org.paymentMethodOwner.id
    const now = moment()
    return stripe.invoices.updateNotifiedAdminPaymentFailed(invoiceId, paymentMethodOwnerId, now.toISOString())
    .then(() => {
      log({ org, now: now.toISOString() }, 'Updated invoice. Publishing event.')
      rabbitmq.publishEvent('organization.invoice.payment-failed', {
        invoicePaymentHasFailedFor24Hours: true,
        organization: {
          id: org.id,
          name: org.name
        },
        paymentMethodOwner: {
          githubId: org.paymentMethodOwner.githubId
        }
      })
    })
  })
}
