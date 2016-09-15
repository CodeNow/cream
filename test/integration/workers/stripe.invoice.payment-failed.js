'use strict'
require('loadenv')()

const Promise = require('bluebird')
const moment = require('moment')
const expect = require('chai').expect
const sinon = require('sinon')

const MockAPI = require('mehpi')
const bigPoppaAPI = new MockAPI('5678')

const OrganizationWithStripeCustomerIdFixture = require('../../fixtures/big-poppa/organization-with-stripe-customer-id')

if (process.env.TEST_STUB_OUT_BIG_POPPA) {
  process.env.BIG_POPPA_HOST = '127.0.0.1:5678'
}

const runnableAPI = require('util/runnable-api-client')
const stripe = require('util/stripe')
const stripeClient = stripe.stripeClient

const testUtil = require('../../util')

const workerServer = require('workers/server')
const httpServer = require('http/server')

describe.only('#stripe.invoice.payment-failed Integration Test', () => {
  let publisher
  let org = Object.assign({}, OrganizationWithStripeCustomerIdFixture)
  let orgId = org.id
  let orgGithubId = org.githubId
  let stripeCustomerId
  let stripeTokenId
  let stripeEvent
  let stripeInvoice
  let updateNotifiedAdminPaymentFailedSpy
  let trialEnd

  // HTTP
  before('Start HTTP server', () => httpServer.start())
  after('Stop HTTP server', () => httpServer.stop())

  // Runnable API Client
  before('Login into runnable API', () => runnableAPI.login())
  after('Logout into runnable API', () => runnableAPI.logout())

  // RabbitMQ
  before('Connect to RabbitMQ', () => {
    return testUtil.connectToRabbitMQ(workerServer, [], ['stripe.invoice.payment-failed'])
      .then(p => { publisher = p })
  })
  after('Disconnect from RabbitMQ', () => {
    return testUtil.disconnectToRabbitMQ(publisher, workerServer)
  })

  before('Create customer, subscription, invoice and get event', function () {
    this.timeout(5000)
    return stripeClient.tokens.create({ // Create token. Customer needs token to pay
      card: {
        number: '4000000000000341', // Attaching this card to a Customer object will succeed, but attempts to charge the customer will fail.
        exp_month: 10,
        exp_year: 2017,
        cvc: '123'
      }
    })
    .then(function createStripeTokenForPaymentMethod (stripeToken) {
      // Create new customer with payment method
      stripeTokenId = stripeToken.id
      return stripeClient.customers.create({
        description: `Customer for organizationId: ${orgId} / githubId: ${orgGithubId}`,
        source: stripeTokenId
      })
    })
    .then(function createSubscription (stripeCustomer) {
      // Create new subscription and create charge right now
      // This will automatically create an invoice
      stripeCustomerId = stripeCustomer.id
      console.log('STRIPE CUST', stripeCustomerId)
      // Warning: Request might fail if it takes more than 5 seconds
      trialEnd = moment().add(2, 'seconds')
      console.log('TRIAL_END', trialEnd.format('X'))
      return stripeClient.subscriptions.create({
        customer: stripeCustomerId,
        plan: 'runnable-starter',
        trial_end: trialEnd.format('X')
      })
    })
  })
  // after('Clean up Stripe', () => {
    // // Deleting the customer deletes the subscription
    // return stripeClient.customers.del(stripeCustomerId)
  // })

  // BigPoppa client
  before('Spy on updateOrganization', () => {
    updateNotifiedAdminPaymentFailedSpy = sinon.spy(stripe.invoice, 'updateNotifiedAdminPaymentFailedSpy')
  })
  after('Restore updateOrganization', () => {
    updateNotifiedAdminPaymentFailedSpy.restore()
  })

  // Big Poppa Mock
  before('Stub out big-poppa calls', done => {
    // Update customer ID in order to be able to query subscription correctly
    org.stripeCustomerId = stripeCustomerId
    bigPoppaAPI.stub('GET', `/organization/?stripeCustomerId=${stripeCustomerId}`).returns({
      status: 200,
      body: [org]
    })
    bigPoppaAPI.stub('PATCH', `/organization/${orgId}`).returns({
      status: 200,
      body: org
    })
    bigPoppaAPI.start(done)
  })
  after(done => {
    bigPoppaAPI.restore()
    bigPoppaAPI.stop(done)
  })

  before('Pay unpaid invoice', function () {
    this.timeout(5000 * 1000 * 60) // Five minutes. See note at the bottom
    const findInvoice = Promise.method(() => {
      return stripeClient.invoices.list(
        { customer: stripeCustomerId }
      )
        .then(res => {
          stripeInvoice = res.data.find(invoice => {
            return invoice.period_end === parseInt(trialEnd.format('X'), 10)
          })
          return !!stripeInvoice
        })
    })
    return testUtil.poll(findInvoice, 5000, 1000 * 60 * 4000)
      .then(function payInvoice () {
        return stripeClient.invoices.pay(stripeInvoice.id)
      })
      .catch(err => {
        if (!err.message.match(/your.*card.*was.*declined/i)) {
          throw err
        }
      })
  })

  before('Publish event', function () {
    this.timeout(5000)
    return stripeClient.events.list(
      { limit: 10, type: 'invoice.payment_failed' }
    )
      .then(res => {
        stripeEvent = res.data.find(stripeEvent => {
          return stripeEvent.data.object.customer === stripeCustomerId
        })
        publisher.publishEvent('stripe.invoice.payment-failed', {
          stripeEventId: stripeEvent.id
        })
      })
  })

  it('should have updated the invoice in Stripe', () => {
    const checkPathOrganizationStub = Promise.method(() => {
      return !!updateNotifiedAdminPaymentFailedSpy.called
    })
    return testUtil.poll(checkPathOrganizationStub, 100, 5000)
      .then(function checkIfInvoiceWasUpdated () {
        return stripeClient.invoices.retrieve(stripeInvoice.id)
      })
      .then(function (invoice) {
        expect(invoice.metadata).to.be.an('object')
        expect(invoice.metadata.paymentMethodOwnerId).to.be.a('string')
        expect(invoice.metadata.paymentMethodOwnerGithubId).to.be.a('string')
      })
  })
})
