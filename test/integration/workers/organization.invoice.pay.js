'use strict'
require('loadenv')()

const Promise = require('bluebird')
const moment = require('moment')
const sinon = require('sinon')
const expect = require('chai').expect

const MockAPI = require('mehpi')
const stripe = require('util/stripe')
const bigPoppaAPI = new MockAPI('5678')

const OrganizationWithStripeCustomerIdFixture = require('../../fixtures/big-poppa/organization-with-stripe-customer-id')

if (process.env.TEST_STUB_OUT_BIG_POPPA) {
  process.env.BIG_POPPA_HOST = '127.0.0.1:5678'
}

const runnableAPI = require('util/runnable-api-client')
const stripeClient = require('util/stripe').stripeClient

const testUtil = require('../../util')

const workerServer = require('workers/server')
const httpServer = require('http/server')

describe('#organization.invoice.pay Integration Test', function () {
  if (!process.env.RUN_SLOW_TESTS) this.pending = true

  let publisher
  let org = Object.assign({}, OrganizationWithStripeCustomerIdFixture)
  let orgId = org.id
  let stripeCustomerId
  let stripeSubscriptionId
  let stripeInvoice
  let trialEnd
  let payInvoiceSpy

  // HTTP
  before('Start HTTP server', () => httpServer.start())
  after('Stop HTTP server', () => httpServer.stop())

  // Runnable API Client
  before('Login into runnable API', () => runnableAPI.login())
  after('Logout into runnable API', () => runnableAPI.logout())

  // RabbitMQ
  before('Connect to RabbitMQ', () => {
    return testUtil.connectToRabbitMQ(workerServer, ['organization.invoice.pay'], [])
      .then(p => { publisher = p })
  })
  after('Disconnect from RabbitMQ', () => {
    return testUtil.disconnectToRabbitMQ(publisher, workerServer)
      .then(() => testUtil.deleteAllExchangesAndQueues())
  })

  before('Create customer, subscription, invoice and get event', function () {
    this.timeout(5000)
    trialEnd = moment().add(5, 'seconds')
    return testUtil.createCustomerAndSubscriptionWithPaymentMethod(org, {
      trialEnd: trialEnd.format('X')
    })
    .tap(res => {
      stripeCustomerId = res.customer.id
      stripeSubscriptionId = res.subscription.id
    })
  })

  before('Assert invoice exists', function () {
    /**
     * It takes about two minutes for Stripe to create an invoice for
     * an expired account
     */
    this.timeout(5000 * 1000 * 60) // Five minutes
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
  })

  after('Clean up Stripe', () => {
    // Deleting the customer deletes the subscription
    return stripeClient.customers.del(stripeCustomerId)
  })

  // BigPoppa client
  before('Spy on updateOrganization', () => {
    payInvoiceSpy = sinon.spy(stripe.invoices, 'pay')
  })
  after('Restore updateOrganization', () => {
    payInvoiceSpy.restore()
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
    publisher.publishTask('organization.invoice.pay', {
      invoice: {
        id: stripeInvoice.id
      },
      organization: {
        id: orgId
      }
    })
  })

  it('should have pay the invoice', () => {
    const checkPathOrganizationStub = Promise.method(() => {
      return !!payInvoiceSpy.called
    })
    return testUtil.poll(checkPathOrganizationStub, 100, 5000)
      .then(function checkIfOrgWasCorrectlyPatched () {
        sinon.assert.calledOnce(payInvoiceSpy)
        return stripe.stripeClient.invoices.retrieve(stripeInvoice.id)
      })
      .then(function assertInvoiceIsPaid (invoice) {
        expect(invoice.paid).to.equal(true)
        expect(invoice.closed).to.equal(true)
      })
  })
})
