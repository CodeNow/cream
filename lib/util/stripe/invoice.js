'use strict'

const keypather = require('keypather')()

const stripeClient = require('util/stripe/client')
const logger = require('util/logger').child({ module: 'stripe/invoice' })

const EntityNotFoundError = require('errors/entity-not-found-error')

module.exports = class StripeInvoiceUtils {

  /**
   * Get an invoice
   *
   * @param {String}   invoiceId - Stripe invoice id
   * @return {Promise}
   * @resolves {Object}
   */
  static get (invoiceId) {
    const log = logger.child({ invoiceId })
    log.info('StripeInvoiceUtils.get called')
    return stripeClient.invoices.retrieve(invoiceId)
      .catch(err => {
        // Error thrown by Stripe API Client: https://stripe.com/docs/api#errors
        if (err.type === 'invalid_request_error') {
          log.trace({ err }, 'Error fetching invoice. Stripe invalid request error')
          throw new EntityNotFoundError('No invoice found for this org', { invoiceId })
        }
        throw err
      })
  }

  /**
   * Get latest invoice for a customer
   *
   * @param {String}     stripeCustomerId - Customer ID in Stripe
   * @returns {Promise}
   */
  static getCurrentInvoice (stripeCustomerId) {
    const log = logger.child({ stripeCustomerId })
    log.info('StripeInvoiceUtils.getCurrentInvoiceForOrganization called')
    return stripeClient.invoices.list({
      customer: stripeCustomerId
    })
      .then(res => {
        let invoices = keypather.get(res, 'data')
        if (!Array.isArray(invoices) || invoices.length === 0) {
          throw new EntityNotFoundError('No invoice found for this organization')
        }
        invoices = invoices.sort(function (a, b) {
          return a.date < b.date
        })
        return invoices[0]
      })
  }

  /**
   * Add payment-method owner to the invoice. This facilitates knowing what
   * user actually paid the invoice
   *
   * @param {Object}     org                  - Organization object
   * @param {String}     org.stripeCustomerId - Customer ID in Stripe
   * @param {String}     invoiceId            - Stripe invoice ID
   * @returns {Promise}
   */
  static updateWithPaymentMethodOwner (org, invoiceId) {
    const log = logger.child({ org: org, invoiceId: invoiceId })
    log.info('StripeInvoiceUtils.updateWithPaymentMethodOwner called')

    return stripeClient.customers.retrieve(org.stripeCustomerId)
      .then(function updateInvoice (customer) {
        return StripeInvoiceUtils._updateMetadata(invoiceId, customer)
      })
  }

  /**
   * Update metadata in invoice. Given a customer, update the metadata for
   * `paymentMethodOwnerId` and `paymentMethodOwnerGithubId`
   *
   * @param {String}     invoiceId - Stripe invoice ID
   * @param {Object}     customer  - Stripe customer object
   * @resolves {Object}  invoice   - Stripe Invoice object
   * @returns {Promise}
   */
  static _updateMetadata (invoiceId, customer) {
    const log = logger.child({ invoiceId: invoiceId, customerMetadata: customer.metadata })
    log.info('StripeInvoiceUtils._updateMetadata called')
    let metatdataUpdates = {
      paymentMethodOwnerId: customer.metadata.paymentMethodOwnerId,
      paymentMethodOwnerGithubId: customer.metadata.paymentMethodOwnerGithubId
    }
    log.trace({ metatdataUpdates: metatdataUpdates, customer: customer }, 'updates to invoice')
    return stripeClient.invoices.update(invoiceId, {
      metadata: metatdataUpdates
    })
  }

  /**
   * Update the invoice with the `notifiedAdminPaymentFailed` property
   *
   * @param {String}       invoiceId            - Invoice ID in Stripe
   * @param {String}       notificationSentTime - ISO8601 timestamp
   * @resolves {Object}                         - Stripe invoice
   * @returns {Promise}
   */
  static updateNotifiedAdminPaymentFailed (invoiceId, userId, notificationSentTime) {
    const log = logger.child({ invoiceId, userId, notificationSentTime }, 'Stripe.updateNotifiedAdminPaymentFailed')
    log.info('Stripe.updateNotifiedAdminPaymentFailed called')
    const updates = {
      metadata: {
        notifiedAdminPaymentFailedUserId: userId,
        notifiedAdminPaymentFailed: notificationSentTime
      }
    }
    return stripeClient.invoices.update(invoiceId, updates)
  }

  /**
   * Update the invoice with the `notifiedAllMembersPaymentFailed` property
   *
   * @param {String}       invoiceId            - Invoice ID in Stripe
   * @param {String}       notificationSentTime - ISO8601 timestamp
   * @resolves {Object}                         - Stripe invoice
   * @returns {Promise}
   */
  static updateNotifiedAllMembersPaymentFailed (invoiceId, notificationSentTime) {
    const log = logger.child({ invoiceId, notificationSentTime }, 'Stripe.updateNotifiedAllMembersPaymentFailed')
    log.info('Stripe.updateNotifiedAllMembersPaymentFailed called')
    const updates = {
      metadata: {
        notifiedAllMembersPaymentFailed: notificationSentTime
      }
    }
    log.trace({ updates }, 'Invoice updates')
    return stripeClient.invoices.update(invoiceId, updates)
  }
}
