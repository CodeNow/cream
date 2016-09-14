'use strict'

const keypather = require('keypather')()

const stripe = require('util/stripe')
const util = require('util/index')
const bigPoppa = require('util/big-poppa')
const rabbitmq = require('util/rabbitmq')
const logger = require('util/logger').child({ module: 'PaymentMethodService' })

module.exports = class PaymentMethodService {

  /**
   * Update the payment method for an organization in Stripe, update the state
   * for the organization and publish and event for it
   *
   * @param {Object}   org                         - Big Poppa organization object
   * @param {Number}   org.id                      - Big Poppa ID
   * @param {String}   org.name                    - Name of the organization
   * @param {String}   stripeToken                 - Stripe token for new payment method
   * @param {Object}   newPaymentMethodOwner       - Object for new payment method owner
   * @param {Number}   newPaymentMethodOwner.id    - Big Poppa ID
   * @param {String}   newPaymentMethodOwner.email - Email stored in MongoDB (maps to github email)
   * @resolves {undefined}
   * @returns {Promise}
   */
  static updatePaymentMethodForOrganization (org, stripeToken, newPaymentMethodOwner, newPaymentMethodOwnerEmail) {
    const log = logger.child({ org: org, stripeToken: stripeToken, newPaymentMethodOwner: newPaymentMethodOwner })
    log.info('updatePaymentMethodForOrganization called')
    // Get current payment method owner to see if PMO has changed
    return PaymentMethodService.getPaymentMethodForOrganization(org)
      .then(res => keypather.get(res, 'owner'))
      .tap(function updatePaymentMethod () {
        return stripe.updatePaymentMethodForOrganization(org, stripeToken, newPaymentMethodOwner, newPaymentMethodOwnerEmail)
      })
      .tap(function updateOrganization () {
        return bigPoppa.updateOrganization(org.id, {
          hasPaymentMethod: true
        })
      })
      .tap(function publishEvents (previousOwner) {
        log.trace({ previousOwner: previousOwner }, 'Compare owner and user')
        let organization = { name: org.name }
        let previousOwnerId = keypather.get(previousOwner, 'id')
        if (previousOwnerId && previousOwnerId !== newPaymentMethodOwner.id) {
          let paymentMethodOwner = { githubId: previousOwner.githubId }
          rabbitmq.publishEvent('organization.payment-method.removed', { organization, paymentMethodOwner })
        }
        let paymentMethodOwner = { githubId: newPaymentMethodOwner.githubId, email: newPaymentMethodOwnerEmail }
        rabbitmq.publishEvent('organization.payment-method.added', { organization, paymentMethodOwner })
      })
      .return() // Don't re-fetch the payment method
  }

  /**
   * Get the payment method for an organization, along with its owner
   *
   * @param {Object}           org                          - Big Poppa organization object
   * @param {String}           org.stripeCustomerId         - Stripe customer id for organization
   * @resolves {Object|null}   paymentMethod                - Payment method (if it exists)
   * @resolves {Object}        paymentMethod.owner          - Payment method owner
   * @resolves {Number}        paymentMethod.owner.id       - Big poppa ID of user
   * @resolves {Number}        paymentMethod.owner.githubId - Github ID of user
   * @resolves {Object}        paymentMethod.card           - Card object from Stripe
   * @return {Promise}
   */
  static getPaymentMethodForOrganization (org) {
    const log = logger.child({ org: org })
    log.info('getPaymentMethodForOrganization called')
    return stripe.getCustomer(keypather.get(org, 'stripeCustomerId'))
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
   * @param {Object}   stripeObject                                     - Either a Stripe customer or an invoice
   * @param {Object}   stripeObject.metadata                            - Hash map of strings
   * @param {String}   stripeObject.metadata.paymentMethodOwnerId       - Big poppa ID for user who added payment method
   * @param {String}   stripeObject.metadata.paymentMethodOwnerGithubId - Github id for user who added payment method
   * @returns {Object}
   */
  static parseOwnerMetadata (stripeObject) {
    return {
      // Metadata is always saved as strings
      id: parseInt(keypather.get(stripeObject, 'metadata.paymentMethodOwnerId'), 10) || null,
      githubId: parseInt(keypather.get(stripeObject, 'metadata.paymentMethodOwnerGithubId'), 10) || null,
      email: keypather.get(stripeObject, 'email') || null
    }
  }
}
