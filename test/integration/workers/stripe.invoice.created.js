'use strict'
require('loadenv')()

const Promise = require('bluebird')
const sinon = require('sinon')
const expect = require('chai').expect

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

describe('#stripe.invoice.created Integration Test', () => {
  let publisher
  let org = Object.assign({}, OrganizationWithStripeCustomerIdFixture)
  let orgId = org.id
  let orgGithubId = org.githubId
  let userId = org.users[0].id
  let userGithubId = org.users[0].githubId
  let stripeCustomerId
  let stripeInvoiceId
  let stripeEvent
  let stripeSubscriptionId
  let updatePlanIdForOrganizationBasedOnCurrentUsageSpy
  let planId
  let updateInvoiceWithPaymentMethodOwnerSpy

  // HTTP
  before('Start HTTP server', () => httpServer.start())
  after('Stop HTTP server', () => httpServer.stop())

  // Runnable API Client
  before('Login into runnable API', () => runnableAPI.login())
  after('Logout into runnable API', () => runnableAPI.logout())

  // RabbitMQ
  before('Connect to RabbitMQ', () => {
    return testUtil.connectToRabbitMQ(workerServer, [], ['stripe.invoice.created'])
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
    .then(function createStripeTokenForPaymentMethodAndFetch (stripeToken) {
      // Create new customer with payment method
      return Promise.all([
        stripeClient.customers.create({
          description: `Customer for organizationId: ${orgId} / githubId: ${orgGithubId}`,
          source: stripeToken.id,
          metadata: {
            paymentMethodOwnerId: userId,
            paymentMethodOwnerGithubId: userGithubId
          }
        }),
        runnableAPI.getAllInstancesForUserByGithubId(orgGithubId)
      ])
    })
    .spread(function createSubscription (stripeCustomer, instances) {
      // Always ensure that we're going to actually change the plan
      if (instances.length <= 2) {
        planId = 'runnable-plus'
      } else {
        planId = 'runnable-basic'
      }
      // Create new subscription and create charge right now
      // This will automatically create an invoice
      stripeCustomerId = stripeCustomer.id
      return stripeClient.subscriptions.create({
        customer: stripeCustomerId,
        plan: planId,
        trial_end: 'now'
      })
    })
    .then(function findInvoice (stripeSubscription) {
      stripeSubscriptionId = stripeSubscription.id
      // Find the invoice for charge
      return stripeClient.invoices.list({
        customer: stripeCustomerId
      })
        .then(res => {
          stripeInvoiceId = res.data[0].id
        })
    })
  })
  after('Clean up Stripe', () => {
    // Deleting the customer deletes the subscription
    return stripeClient.customers.del(stripeCustomerId)
  })

  // BigPoppa client
  before('Spy on stripe methods', () => {
    updatePlanIdForOrganizationBasedOnCurrentUsageSpy = sinon.spy(stripe.subscriptions, 'updatePlanIdForOrganizationBasedOnCurrentUsage')
    updateInvoiceWithPaymentMethodOwnerSpy = sinon.spy(stripe.invoices, 'updateWithPaymentMethodOwner')
  })
  after('Restore stripe methods', () => {
    updatePlanIdForOrganizationBasedOnCurrentUsageSpy.restore()
    updateInvoiceWithPaymentMethodOwnerSpy.restore()
  })

  // Big Poppa Mock
  before('Stub out big-poppa calls', done => {
    // Update customer ID in order to be able to query subscription correctly
    org.stripeCustomerId = stripeCustomerId
    org.stripeSubscriptionId = stripeSubscriptionId
    bigPoppaAPI.stub('GET', `/organization/?stripeCustomerId=${stripeCustomerId}`).returns({
      status: 200,
      body: [org]
    })
    bigPoppaAPI.start(done)
  })
  after(done => {
    bigPoppaAPI.restore()
    bigPoppaAPI.stop(done)
  })

  before('Publish event', () => {
    return stripeClient.events.list(
      { limit: 10, type: 'invoice.created' }
    )
    .then(res => {
      stripeEvent = res.data.find(stripeEvent => {
        return stripeEvent.data.object.id === stripeInvoiceId
      })
      publisher.publishEvent('stripe.invoice.created', {
        stripeEventId: stripeEvent.id
      })
    })
  })

  it('should update the plan for the organization based on current usage', function () {
    this.timeout(5000)
    const checkPlanUpdated = Promise.method(() => {
      return !!updatePlanIdForOrganizationBasedOnCurrentUsageSpy.called
    })
    return testUtil.poll(checkPlanUpdated, 100, 5000)
      .delay(1000)
      .then(function fetchSubscription () {
        return stripeClient.subscriptions.retrieve(stripeSubscriptionId)
      })
      .then(function checkSubscriptionWasUpdated (stripeSubscription) {
        expect(stripeSubscription).to.have.deep.property('plan.id')
        // It should have changed the plan
        expect(stripeSubscription.plan.id).to.not.equal(planId)
      })
  })

  it('should update the invoice with the payment method owner and mark it as paid', function () {
    this.timeout(5000)
    const checkInvoiceUpdated = Promise.method(() => {
      return !!updateInvoiceWithPaymentMethodOwnerSpy.called
    })
    return testUtil.poll(checkInvoiceUpdated, 100, 5000)
      .delay(1000)
      .then(function fetchInvoice () {
        return stripeClient.invoices.retrieve(stripeInvoiceId)
      })
      .then(function checkInvoiceWasUpdatedAndPaid (invoice) {
        expect(invoice).to.have.deep.property('metadata.paymentMethodOwnerId', userId.toString())
        expect(invoice).to.have.deep.property('metadata.paymentMethodOwnerGithubId', userGithubId.toString())
        expect(invoice).to.have.property('paid', true)
      })
  })
})
