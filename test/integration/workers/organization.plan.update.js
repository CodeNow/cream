'use strict'
require('loadenv')()

const Promise = require('bluebird')
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

const testUtil = require('../../util')

const workerServer = require('workers/server')
const httpServer = require('http/server')

describe('#organiztion.plan.update Integration Test', () => {
  let org = Object.assign({}, OrganizationWithStripeCustomerIdFixture)
  let orgId = org.id
  let orgGithubId = org.githubId
  let stripeCustomerId
  let stripeSubscriptionId
  let publisher
  let users = [
    { githubId: 678 },
    { githubId: 123 },
    { githubId: 456 },
    { githubId: 901 }
  ]

  let updateUsersForPlanSpy

  // HTTP
  before('Start HTTP server', () => httpServer.start())
  after('Stop HTTP server', () => httpServer.stop())

  // Runnable API Client
  before('Login into runnable API', () => runnableAPI.login())
  after('Logout into runnable API', () => runnableAPI.logout())

  // RabbitMQ
  before('Connect to RabbitMQ', () => {
    return testUtil.connectToRabbitMQ(workerServer, ['cream.organization.user.added'], [])
      .then(p => { publisher = p })
  })
  after('Disconnect from RabbitMQ', () => {
    return testUtil.disconnectToRabbitMQ(publisher, workerServer)
  })

  before('Spy on updateOrganization', () => {
    updateUsersForPlanSpy = sinon.spy(stripe.subscriptions, 'updateUsersForPlan')
  })
  after('Restore updateOrganization', () => {
    updateUsersForPlanSpy.restore()
  })

  before('Create customer and subscription', function () {
    this.timeout(5000)
    return stripe.stripeClient.customers.create({
      description: `Customer for organizationId: ${orgId} / githubId: ${orgGithubId}`
    })
    .then(stripeCustomer => {
      stripeCustomerId = stripeCustomer.id
      return stripe.stripeClient.subscriptions.create({
        customer: stripeCustomerId,
        plan: 'runnable-starter'
      })
    })
    .then(stripeSubscription => {
      stripeSubscriptionId = stripeSubscription.id
    })
  })

  after('Clean up Stripe', () => {
    // Deleting the customer deletes the subscription
    return stripe.stripeClient.customers.del(stripeCustomerId)
  })

  // Big Poppa Mock
  before('Stub out big-poppa calls', done => {
    org.users = users
    // Update customer ID in order to be able to query subscription correctly
    org.stripeCustomerId = stripeCustomerId
    org.stripeSubscriptionId = stripeSubscriptionId
    bigPoppaAPI.stub('GET', `/organization/${orgId}`).returns({
      status: 200,
      body: org
    })
    bigPoppaAPI.start(done)
  })
  after(done => {
    bigPoppaAPI.restore()
    bigPoppaAPI.stop(done)
  })

  it('should trigger organization.user.added', function () {
    if (!process.env.TEST_STUB_OUT_BIG_POPPA) return this.skip()

    publisher.publishEvent('organization.user.added', {
      organization: {
        id: orgId,
        githubId: orgGithubId
      },
      user: {
        id: org.users[0].id,
        githubId: org.users[0].githubId
      }
    })
  })

  it('should have update the subscription in Stripe', function () {
    this.timeout(5000)
    const checkCustomerCreated = Promise.method(() => {
      // Check if spy has been called
      return !!updateUsersForPlanSpy.called
    })
    return testUtil.poll(checkCustomerCreated, 100, 5000)
      .delay(1000)
      .then(function checkStripeForUpdatePlan () {
        return stripe.stripeClient.subscriptions.retrieve(stripeSubscriptionId)
          .then(subscription => {
            expect(subscription).to.have.deep.property('plan.id', 'runnable-starter')
            expect(subscription).to.have.property('quantity', users.length)
            let userGithubIds = JSON.stringify(users.map(x => x.githubId))
            expect(subscription).to.have.deep.property('metadata.users', userGithubIds)
          })
      })
  })
})
