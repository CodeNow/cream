'use strict'
require('loadenv')()

const Promise = require('bluebird')
const expect = require('chai').expect
const sinon = require('sinon')

const MockAPI = require('mehpi')
const bigPoppaAPI = new MockAPI('5678')

const OrganizationFixture = require('../../fixtures/big-poppa/organization')

if (process.env.TEST_STUB_OUT_BIG_POPPA) {
  process.env.BIG_POPPA_HOST = '127.0.0.1:5678'
}

const bigPoppa = require('util/big-poppa')
const runnableAPI = require('util/runnable-api-client')
const stripe = require('util/stripe')
const rabbitmq = require('util/rabbitmq')

const testUtil = require('../../util')

const workerServer = require('workers/server')
const httpServer = require('http/server')

describe('#organiztion.subscription.create Integration Test', () => {
  const org = Object.assign({}, OrganizationFixture)
  const orgId = OrganizationFixture.id
  let stripeCustomerId
  let stripeSubscriptionId
  const orgGithubId = OrganizationFixture.githubId
  let publisher

  let updateOrganizationSpy

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
      .then(() => testUtil.deleteAllExchangesAndQueues())
  })

  before('Spy on updateOrganization', () => {
    updateOrganizationSpy = sinon.spy(bigPoppa, 'updateOrganization')
  })

  after('Restore updateOrganization', () => {
    updateOrganizationSpy.restore()
  })

  before('Create customer, subscription, invoice and get event', function () {
    this.timeout(5000)
    return stripe.stripeClient.tokens.create({ // Create token. Customer needs token to pay
      card: {
        number: '4242424242424242',
        exp_month: 12,
        exp_year: 2017,
        cvc: '123'
      }
    })
    .then(function createStripeTokenForPaymentMethod (stripeToken) {
      // Create new customer with payment method
      const stripeTokenId = stripeToken.id
      return stripe.stripeClient.customers.create({
        description: `Customer for organizationId: ${orgId} / githubId: ${orgGithubId}`,
        source: stripeTokenId
      })
    })
    .then(stripeCustomer => {
      stripeCustomerId = stripeCustomer.id
    })
  })

  before('Stub out big-poppa calls', () => {
    org.stripeCustomerId = stripeCustomerId
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
    publisher.publishTask('organization.subscription.create', {
      organization: {
        id: orgId
      }
    })
  })

  it('should have update the organization', function (done) {
    this.timeout(5000)
    const checkCustomerCreated = Promise.method(() => updateOrganizationSpy.called)
    return testUtil.poll(checkCustomerCreated, 100, 5000)
      .delay(1000)
      .then(function checkStripe () {
        stripeSubscriptionId = updateOrganizationSpy.firstCall.args[1].stripeSubscriptionId
        return stripe.stripeClient.subscriptions.retrieve(stripeSubscriptionId)
          .then(function checkSubscription (subscription) {
            expect(subscription).to.be.an('object')
            expect(subscription.trial_end).to.be.below((new Date()).getTime() / 1000)
            expect(subscription.plan.id).to.be.a.match(/runnable/i)
            let usersMetadata = JSON.parse(subscription.metadata.users)
            expect(usersMetadata).to.be.an('array')
            expect(usersMetadata).to.have.lengthOf(3)
            expect(usersMetadata[0]).to.equal(OrganizationFixture.users[0].githubId)
          })
      })
      .asCallback(done)
  })
})
