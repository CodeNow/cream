'use strict'
require('loadenv')()

const Promise = require('bluebird')
const expect = require('chai').expect
const sinon = require('sinon')

const moment = require('moment')
const MockAPI = require('mehpi')
const bigPoppaAPI = new MockAPI('5678')

const OrganizationWithStripeCustomerIdFixture = require('../../fixtures/big-poppa/organization-with-stripe-customer-id')

if (process.env.TEST_STUB_OUT_BIG_POPPA) {
  process.env.BIG_POPPA_HOST = '127.0.0.1:5678'
}

const runnableAPI = require('util/runnable-api-client')
const stripe = require('util/stripe')
const rabbitmq = require('util/rabbitmq')

const testUtil = require('../../util')

const workerServer = require('workers/server')
const httpServer = require('http/server')

describe('#organization.trial.ended.check Integration Test', () => {
  const trialEnd = moment().add(7, 'days')
  const org2 = Object.assign({}, OrganizationWithStripeCustomerIdFixture, { id: 92, githubId: 10224621, trialEnd })
  const org3 = Object.assign({}, OrganizationWithStripeCustomerIdFixture, { id: 93, githubId: 2828361, trialEnd })
  const org3Id = org3.id
  let org3SubscriptionId
  let publisher
  let nowISOString

  let updateSubscriptionWithTrialEndedNotificationStub
  let publishEventStub
  let momentStub

  // HTTP
  before('Start HTTP server', () => httpServer.start())
  after('Stop HTTP server', () => httpServer.stop())

  // Runnable API Client
  before('Login into runnable API', function () {
    this.timeout(5000)
    return runnableAPI.login()
  })
  after('Logout into runnable API', () => runnableAPI.logout())

  // RabbitMQ Client
  before('Connect to RabbitMQ', () => rabbitmq.connect())
  after('Disconnect from RabbitMQ', () => rabbitmq.disconnect())

  // RabbitMQ Publisher
  before('Connect to RabbitMQ', () => {
    return testUtil.connectToRabbitMQ(workerServer, ['organization.trial.ended.check'], [])
      .then(p => { publisher = p })
  })
  after('Disconnect from RabbitMQ', () => {
    return testUtil.disconnectToRabbitMQ(publisher, workerServer)
  })

  before('Spy on calls', () => {
    updateSubscriptionWithTrialEndedNotificationStub = sinon.spy(stripe, 'updateSubscriptionWithTrialEndedNotification')
    publishEventStub = sinon.spy(rabbitmq, 'publishEvent')
  })
  after('Restore spies', () => {
    updateSubscriptionWithTrialEndedNotificationStub.restore()
    publishEventStub.restore()
  })

  before('Create customer and subscription', function () {
    this.timeout(10000)
    return Promise.all([
      testUtil.createCustomerAndSubscription(org2),
      testUtil.createCustomerAndSubscription(org3)
    ])
      .spread((res2, res3) => {
        // Save the subscription id for org3
        org3SubscriptionId = res3.subscription.id
        // Update org 2 subscription to have correct metadata
        return stripe.stripeClient.subscriptions.update(res2.subscription.id, {
          metadata: {
            notifiedTrialEnded: moment().toISOString()
          }
        })
      })
  })
  after('Clean up Stripe', function () {
    this.timeout(5000)
    // Deleting the customer deletes the subscription
    return Promise.all([
      stripe.stripeClient.customers.del(org2.stripeCustomerId),
      stripe.stripeClient.customers.del(org3.stripeCustomerId)
    ])
  })

  /**
   * Stub out `moment().toISOString()` in order to be able to match queries
   * to BP in `mephi`. This is a limitation in Mephi for not allowing fuzzy
   * matches and/or regular expressions.
   */
  before('Stub out moment', () => {
    let now = moment()
    nowISOString = now.toISOString()
    momentStub = sinon.stub(now.constructor.prototype, 'toISOString').returns(nowISOString)
  })
  after('Restore moment', () => {
    momentStub.restore()
  })

  // Big Poppa Mock
  before('Stub out big-poppa calls', done => {
    // Set hasPaymentMethod to true and false
    org2.hasPaymentMethod = false
    org3.hasPaymentMethod = false
    // Change trielEndDate on org 3 and 4 to be ended organization
    org2.trialEnd = moment().subtract(1, 'days')
    org3.trialEnd = moment().subtract(1, 'hours')
    bigPoppaAPI.stub('GET', /organization.*hasPaymentMethod.*false.*stripeCustomerId.*trialEnd/i).returns({
      status: 200,
      body: JSON.stringify([org2, org3])
    })
    bigPoppaAPI.start(done)
  })
  after(done => {
    bigPoppaAPI.restore()
    bigPoppaAPI.stop(done)
  })

  it('should publish the `organiztion.trial.ended` event', function () {
    this.timeout(5000)
    publisher.publishTask('organization.trial.ended.check', {})

    const checkCustomerCreated = Promise.method(() => {
      // Check if spy has been called
      return !!updateSubscriptionWithTrialEndedNotificationStub.called
    })
    return testUtil.poll(checkCustomerCreated, 100, 5000)
      .delay(1000)
      .then(function checkStripeForUpdatePlan () {
        // Assert the event was published
        sinon.assert.calledOnce(publishEventStub)
        sinon.assert.calledWith(publishEventStub, 'organization.trial.ended', {
          organization: {
            id: org3Id,
            name: org3.name
          },
          tid: sinon.match.string
        })
        // Assert Stripe was updated
        return stripe.stripeClient.subscriptions.retrieve(org3SubscriptionId)
          .then(subscription => {
            expect(subscription).to.have.deep.property('metadata.notifiedTrialEnded')
          })
      })
  })
})
