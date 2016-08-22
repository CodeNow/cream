'use strict'
require('loadenv')()

const Promise = require('bluebird')
const fs = Promise.promisifyAll(require('fs'))

const stripeClient = require('util/stripe').stripeClient
const fixturePath = 'test/fixtures/stripe'

const OrganizationWithStripeCustomerIdFixture = require('../test/fixtures/big-poppa/organization-with-stripe-customer-id')

const orgId = OrganizationWithStripeCustomerIdFixture.id
const orgGithubId = OrganizationWithStripeCustomerIdFixture.githubId
const userId = OrganizationWithStripeCustomerIdFixture.users[0].id
const userGithubId = OrganizationWithStripeCustomerIdFixture.users[0].githubId

const convertToJSModule = (fileName, jsonObject) => {
  let contents = 'module.exports = ' + JSON.stringify(jsonObject, null, 2).replace(/"/g, "'") + '\n'
  return fs.writeFileAsync(`${fixturePath}/${fileName}`, contents)
}

let stripeCustomerId

Promise.resolve()
  .then(function () {
    return stripeClient.tokens.create({ // Create token. Customer needs token to pay
      card: {
        number: '4242424242424242',
        exp_month: 12,
        exp_year: 2017,
        cvc: '123'
      }
    })
  })
  .tap(stripeToken => {
    return convertToJSModule('token.js', stripeToken)
  })
  .then(function createStripeTokenForPaymentMethod (stripeToken) {
    // Create new customer with payment method
    return stripeClient.customers.create({
      description: `Customer for organizationId: ${orgId} / githubId: ${orgGithubId}`,
      source: stripeToken.id,
      metadata: {
        paymentMethodOwnerId: userId,
        paymentMethodOwnerGithubId: userGithubId
      }
    })
  })
  .tap(stripeCustomer => {
    return convertToJSModule('customer.js', stripeCustomer)
  })
  .then(function createSubscription (stripeCustomer) {
    // Create new subscription and create charge right now
    // This will automatically create an invoice
    stripeCustomerId = stripeCustomer.id
    return stripeClient.subscriptions.create({
      customer: stripeCustomer.id,
      plan: 'runnable-starter',
      trial_end: 'now'
    })
  })
  .tap(stripeSubscription => {
    return convertToJSModule('subscription.js', stripeSubscription)
  })
  .then(function findInvoice (stripeSubscription) {
    // Find the invoice for charge
    return stripeClient.invoices.list({
      customer: stripeCustomerId
    })
      .then(res => {
        return res.data[0]
      })
  })
  .then(invoice => {
    return stripeClient.invoices.update(invoice.id, {
      metadata: {
        paymentMethodOwnerId: userId,
        paymentMethodOwnerGithubId: userGithubId
      }
    })
  })
  .tap(stripeInvoice => {
    return convertToJSModule('invoice.js', stripeInvoice)
  })

