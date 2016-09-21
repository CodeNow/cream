'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))
const pluck = require('101/pluck')
const keypather = require('keypather')()
const moment = require('moment')

const OrganizationService = require('services/organization-service')
const stripe = require('util/stripe')
const logger = require('util/logger').child({ module: 'worker/organizations.invoice.payment-failed.check' })
const rabbitmq = require('util/rabbitmq')

const errorHandler = require('workers/error-handler')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
module.exports.jobSchema = Joi.object({
  tid: Joi.string().guid()
}).required()

const filterHandler = (org, logMessage) => {
  const log = logger.child({ org, logMessage }, 'filterHandler')
  return () => {
    log.trace('filterHandler called')
    return Promise.resolve()
      .then(() => true)
      .catch(err => {
        log.warn({ err, org }, logMessage)
        return false
      })
  }
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
module.exports = function CheckInvoicedPaymentFailed (job) {
  const log = logger.child({})
  log.info('CheckInvoicedPaymentFailed called')
  return OrganizationService.getAllOrgsWithPaymentMethodInLast48HoursOfGracePeriod()
  // Get latests invoice
  .filter(function getLastInvoiceForOrganization (org) {
    return stripe.invoice.getLastInvoiceForOrganization(org.stripeCustomerId)
      .then(invoice => { Object.assign(org, { invoice }) })
      .then(filterHandler(org, 'Error fetching invoice for organization'))
  })
  .filter(function filterAlreadyNotified (organizationWith48HoursLeftInGracePeriod) {
    return !keypather.get(organizationWith48HoursLeftInGracePeriod, 'invoice.metadata.notifiedAllMembersPaymentFailed')
  })
  .filter(function fetchPaymentMethodOwner (org) {
    return stripe.getCustomerPaymentMethodOwner(org.stripeCustomerId)
      .then(paymentMethodOwner => { Object.assign(org, { paymentMethodOwner }) })
      .then(filterHandler(org, 'Error fetching paymentMethodOwner'))
  })
  .filter(function updateSubscriptionProperty (org) {
    return stripe.invoices.updateNotifiedAdminPaymentFailed(org.invoice.id, moment().toISOString())
      .then(filterHandler(org, 'Error updating invoice for organization'))
  })
  .each(function publishEvent (org) {
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
  .map(pluck('id')) // For logging purposes
  .catch(errorHandler)
}
