'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))
const pick = require('101/pick')
const keypather = require('keypather')()
const moment = require('moment')

const OrganizationService = require('services/organization-service')
const stripe = require('util/stripe')
const logger = require('util/logger').child({ module: 'worker/organizations.invoice.payment-failed.check' })
const rabbitmq = require('util/rabbitmq')

const pickProps = pick(['id', 'name', 'stripeCustomerId'])

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
module.exports.jobSchema = Joi.object({
  tid: Joi.string().guid()
}).required()

const filterErrorHandler = (org, logMessage) => {
  const log = logger.child({ org, logMessage }, 'filterErrorHandler')
  return (err) => {
    log.warn({ err, org }, `Error: ${logMessage}`)
    return false
  }
}

const logHandler = (logMessage) => {
  const log = logger.child({ logMessage }, 'filterErrorHandler')
  return (orgs) => {
    let organizations = orgs.map(pickProps)
    log.trace({ organizations, numberOfOrganizations: organizations.length }, logMessage)
    return organizations
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
  .filter(function getCurrentInvoice (org) {
    return stripe.invoices.getCurrentInvoice(org.stripeCustomerId)
      .then(invoice => { Object.assign(org, { invoice }) })
      .return(true)
      .catch(filterErrorHandler(org, 'Fetching invoice for organization'))
  })
  .tap(logHandler('Organizations with fetched invoices'))
  .filter(function filterAlreadyPaidOrNotified (org) {
    let attempted = keypather.get(org, 'invoice.attempted')
    let paid = keypather.get(org, 'invoice.paid')
    // Send immediately after failure
    let notifiedAdmin = !!keypather.get(org, 'invoice.metadata.notifiedAdminPaymentFailed')
    // 48 hours after active period ends
    let notifiedAllMembers = !!keypather.get(org, 'invoice.metadata.notifiedAllMembersPaymentFailed')
    let shouldBeNotified = attempted && !paid && notifiedAdmin && !notifiedAllMembers
    log.trace(
      { org: pickProps(org), attempted, paid, notifiedAdmin, notifiedAllMembers, shouldBeNotified, invoice: org.invoice },
      'Check if invoice has failed and user has been notified'
    )
    return shouldBeNotified
  })
  .tap(logHandler('Organizations not already notified'))
  .filter(function fetchPaymentMethodOwner (org) {
    return stripe.getCustomerPaymentMethodOwner(org.stripeCustomerId)
      .then(paymentMethodOwner => { Object.assign(org, { paymentMethodOwner }) })
      .return(true)
      .catch(filterErrorHandler(org, 'Fetching paymentMethodOwner'))
  })
  .tap(logHandler('Organizations with customer payment method'))
  .filter(function updateSubscriptionProperty (org) {
    let invoiceId = org.invoice.id
    let time = moment().toISOString()
    return stripe.invoices.updateNotifiedAllMembersPaymentFailed(invoiceId, time)
      .return(true)
      .catch(filterErrorHandler(org, 'Updating invoice for organization'))
  })
  .tap(logHandler('Organizations with update invoices'))
  .each(function publishEvent (org) {
    log.trace({ orgId: org.id, orgName: org.name }, 'Publishing `invoice.payment-failed` event')
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
    return true // Don't throw bluebird warning
  })
  .then(logHandler('Organizations with published events'))
}
