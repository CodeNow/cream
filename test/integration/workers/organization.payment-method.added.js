'use strict'
require('loadenv')()

const Promise = require('bluebird')
const moment = require('moment')
const expect = require('chai').expect
const sinon = require('sinon')

const MockAPI = require('mehpi')
const bigPoppaAPI = new MockAPI('5678')

const OrganizationFixture = require('../../fixtures/big-poppa/organization')

if (process.env.TEST_STUB_OUT_BIG_POPPA) {
  process.env.BIG_POPPA_HOST = '127.0.0.1:5678'
}

const stripe = require('util/stripe')
const stripeClient = stripe.stripeClient
const runnableAPI = require('util/runnable-api-client')
const rabbitmq = require('util/rabbitmq')

const testUtil = require('../../util')

const workerServer = require('workers/server')
const httpServer = require('http/server')

describe('#organiztion.payment-method.added Integration Test', () => {
  const org = Object.assign({}, OrganizationFixture)
  const orgId = OrganizationFixture.id
  let stripeCustomerId
  let stripeSubscriptionId
  let publishTaskStub
  let stripeInvoice
  let trialEnd
  let publisher

  // HTTP
  before('Start HTTP server', () => httpServer.start())
  after('Stop HTTP server', () => httpServer.stop())

  // Runnable API Client
  before('Login into runnable API', () => runnableAPI.login())
  after('Logout into runnable API', () => runnableAPI.logout())

  // Big Poppa Mock
  before(done => bigPoppaAPI.start(done))
  after(done => bigPoppaAPI.stop(done))

  // RabbitMQ Client
  before('Connect to RabbitMQ', () => rabbitmq.connect())
  after('Disconnect from RabbitMQ', () => rabbitmq.disconnect())

  // RabbitMQ server
  before('Connect to RabbitMQ', () => {
    return testUtil.connectToRabbitMQ(workerServer, [], [])
      .then(p => { publisher = p })
  })
  after('Disconnect from RabbitMQ', () => {
    return testUtil.disconnectToRabbitMQ(publisher, workerServer)
  })

  before('Stub publishTask', () => {
    publishTaskStub = sinon.spy(rabbitmq, 'publishTask')
  })

  after('Restore publishTask', () => {
    publishTaskStub.restore()
  })

  before('Create customer, subscription, invoice and get event', function () {
    this.timeout(5000)
    trialEnd = moment().add(2, 'seconds')
    return testUtil.createCustomerAndSubscriptionWithPaymentMethod(org, {
      trialEnd: trialEnd.format('X'),
      useFailingCard: true
    })
    .then(res => {
      stripeCustomerId = res.customer.id
      stripeSubscriptionId = res.subscription.id
    })
  })

  before('Close unpaid invoice', function () {
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
      .then(function payInvoice () {
        return stripeClient.invoices.update(stripeInvoice.id, { close: true })
      })
      .catch(err => {
        // Card should be declined (That's what we're testing)
        if (!err.message.match(/your.*card.*was.*declined/i)) {
          throw err
        }
      })
  })

  before('Stub out big-poppa calls', () => {
    org.stripeCustomerId = stripeCustomerId
    org.stripeSubscriptionId = stripeSubscriptionId
    org.allowed = false
    org.hasPaymentMethod = true
    bigPoppaAPI.stub('GET', `/organization/${orgId}`).returns({
      status: 200,
      body: org
    })
    bigPoppaAPI.stub('PATCH', `/organization/${orgId}`).returns({
      status: 200,
      body: org
    })
  })

  after('Clean up Stripe', () => {
    // Deleting the customer deletes the subscription
    return stripe.stripeClient.customers.del(stripeCustomerId)
  })

  /**
   * Tests are meant to be run sequentially. Might not work with `.only`
   */
  it('should trigger organization subscription create', function () {
    rabbitmq.publishEvent('organization.payment-method.added', {
      organization: {
        id: orgId
      }
    })
  })

  xit('should have update the organization', function (done) {
    this.timeout(5000)
    const checkCustomerCreated = Promise.method(() => publishTaskStub.called)
    return testUtil.poll(checkCustomerCreated, 100, 5000)
      .delay(1000)
      .then(function checkStub () {
        expect(publishTaskStub.firstCall.args[0], {
          organization: {
            id: org.id
          }
        })
      })
      .asCallback(done)
  })
})
