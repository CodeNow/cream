'use strict'
require('loadenv')()

const Promise = require('bluebird')
const moment = require('moment')
const sinon = require('sinon')

const MockAPI = require('mehpi')
const bigPoppaAPI = new MockAPI('5678')

const OrganizationWithStripeCustomerIdFixture = require('../../fixtures/big-poppa/organization-with-stripe-customer-id')

if (process.env.TEST_STUB_OUT_BIG_POPPA) {
  process.env.BIG_POPPA_HOST = '127.0.0.1:5678'
}

const runnableAPI = require('util/runnable-api-client')
const stripeClient = require('util/stripe').stripeClient
const bigPoppa = require('util/big-poppa')

const testUtil = require('../../util')

const workerServer = require('workers/server')
const httpServer = require('http/server')

describe('#stripe.invoice.payment-succeeded Integration Test', () => {
  let publisher
  let org = Object.assign({}, OrganizationWithStripeCustomerIdFixture)
  let orgId = org.id
  let orgGithubId = org.githubId
  let stripeCustomerId
  let stripeTokenId
  let stripeInvoice
  let stripeEvent
  let updateOrganizationSpy

  // HTTP
  before('Start HTTP server', () => httpServer.start())
  after('Stop HTTP server', () => httpServer.stop())

  // Runnable API Client
  before('Login into runnable API', () => runnableAPI.login())
  after('Logout into runnable API', () => runnableAPI.logout())

  // RabbitMQ
  before('Connect to RabbitMQ', () => {
    return testUtil.connectToRabbitMQ(workerServer, [], ['stripe.invoice.payment-succeeded'])
      .then(p => { publisher = p })
  })
  after('Disconnect from RabbitMQ', () => {
    return testUtil.disconnectToRabbitMQ(publisher, workerServer)
  })

  before('Create customer, subscription, invoice and get event', function () {
    this.timeout(5000)
    return stripeClient.tokens.create({ // Create token. Customer needs token to pay
      card: {
        number: '4242424242424242',
        exp_month: 12,
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
      return stripeClient.subscriptions.create({
        customer: stripeCustomerId,
        plan: 'runnable-starter',
        trial_end: 'now'
      })
    })
    .then(function findInvoice (stripeSubscription) {
      // Find the invoice for charge
      return stripeClient.invoices.list({
        customer: stripeCustomerId
      })
        .then(res => {
          stripeInvoice = res.data[0]
        })
    })
  })
  after('Clean up Stripe', () => {
    // Deleting the customer deletes the subscription
    return stripeClient.customers.del(stripeCustomerId)
  })

  // BigPoppa client
  before('Spy on updateOrganization', () => {
    updateOrganizationSpy = sinon.spy(bigPoppa, 'updateOrganization')
  })
  after('Restore updateOrganization', () => {
    updateOrganizationSpy.restore()
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

  before('Publish event', () => {
    return stripeClient.events.list(
      { limit: 10, type: 'invoice.payment_succeeded' }
    )
    .then(res => {
      stripeEvent = res.data.find(stripeEvent => {
        return stripeEvent.data.object.id === stripeInvoice.id
      })
      publisher.publishEvent('stripe.invoice.payment-succeeded', {
        stripeEventId: stripeEvent.id
      })
    })
  })

  it('should have patched the organization', () => {
    const checkPathOrganizationStub = Promise.method(() => {
      return !!updateOrganizationSpy.called
    })
    return testUtil.poll(checkPathOrganizationStub, 100, 5000)
      .then(function checkIfOrgWasCorrectlyPatched () {
        let periodEndTimestamp = stripeEvent.data.object.lines.data[0].period.end
        let periodEnd = moment(periodEndTimestamp, 'X')
        sinon.assert.calledOnce(updateOrganizationSpy)
        sinon.assert.calledWithExactly(
          updateOrganizationSpy,
          orgId,
          { activePeriodEnd: periodEnd.toISOString() }
        )
      })
  })
})
