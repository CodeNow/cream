'use strict'

const stripeClient = require('util/stripe/client')
const logger = require('util/logger').child({ module: 'stripe/invoice' })

module.exports = class StripeInvoiceUtils {

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
   * @param {String}       invoiceId - Invoice ID in Stripe
   * @param {String}       notificationSentTime - ISO8601 timestamp
   * @resolves {Object}                         - Stripe invoice
   * @returns {Promise}
   */
  static updateNotifiedAdminPaymentFailed (invoiceId, notificationSentTime) {
    const log = logger.child({ invoiceId, notificationSentTime }, 'Stripe.updateNotifiedAdminPaymentFailed')
    log.info('Stripe.updateNotifiedAdminPaymentFailed called')
    const updates = {
      metadata: {
        notifiedAdminPaymentFailed: notificationSentTime
      }
    }
    return stripeClient.invoices.update(invoiceId, updates)
  }

}
