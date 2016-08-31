'use strict'

const keypather = require('keypather')()

const stripe = require('util/stripe')
const util = require('util/index')
const bigPoppa = require('util/big-poppa')
const rabbitmq = require('util/rabbitmq')
const logger = require('util/logger').child({ module: 'PaymentMethodService' })

module.exports = class PaymentMethodService {

  static updatePaymentMethodForOrganization (org, stripeToken, newPaymentMethodOwner) {
    const log = logger.child({ org: org, stripeToken: stripeToken, newPaymentMethodOwner: newPaymentMethodOwner })
    log.info('updatePaymentMethodForOrganization called')
    // Get current payment method owner to see if PMO has changed
    return PaymentMethodService.getPaymentMethodForOrganization(org)
      .then(res => keypather.get(res, 'owner'))
      .tap(function updatePaymentMethod () {
        return stripe.updatePaymentMethodForOrganization(org, stripeToken, newPaymentMethodOwner)
      })
      .tap(function updateOrganization () {
        return bigPoppa.updateOrganization(org.id, {
          hasPaymentMethod: true
        })
      })
      .tap(function publishEvents (previousOwner) {
        log.trace({ previousOwner: previousOwner }, 'Compare owner and user')
        let organization = { name: org.name }
        if (previousOwner && previousOwner.id !== newPaymentMethodOwner.id) {
          let user = { githubId: previousOwner.githubId }
          rabbitmq.publishEvent('organization.payment-method.removed', { organization, user })
        }
        let user = { githubId: newPaymentMethodOwner.githubId }
        rabbitmq.publishEvent('organization.payment-method.added', { organization, user })
      })
      .return() // Don't re-fetch the payment method
  }

  static getPaymentMethodForOrganization (org) {
    const log = logger.child({ org: org })
    log.info('getPaymentMethodForOrganization called')
    return stripe.getCustomer(org.stripeCustomerId)
      .then(function parseCardAndResponse (customer) {
        log.trace({ customer: customer }, 'Customer object fetched')
        let sources = keypather.get(customer, 'sources.data')
        if (!Array.isArray(sources)) return null

        let paymentMethod = sources.filter(x => x.object === 'card')[0]
        if (!paymentMethod) return null

        // Remove potentially sensitive information
        delete paymentMethod.customer
        delete paymentMethod.id
        return {
          // Stripe always stores all metadata as strings
          owner: PaymentMethodService.parseOwnerMetadata(customer),
          // Currently, we only have credit cards as payment methods
          card: util.convertObjectToCamelCase(paymentMethod)
        }
      })
  }

  /**
   * Parse owner from object returned by Stripe
   *
   * @param {Object} stripeObject
   * @param {Object} stripeObject.metadata
   * @param {String} stripeObject.metadata.paymentMethodOwnerId
   * @param {String} stripeObject.metadata.paymentMethodOwnerGithubId
   * @returns {Object}
   */
  static parseOwnerMetadata (stripeObject) {
    return {
      // Metadata is always saved as strings
      id: parseInt(keypather.get(stripeObject, 'metadata.paymentMethodOwnerId'), 10),
      githubId: parseInt(keypather.get(stripeObject, 'metadata.paymentMethodOwnerGithubId'), 10)
    }
  }
}
