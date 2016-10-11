'use strict'
require('loadenv')()

const Promise = require('bluebird')
const expect = require('chai').expect
const sinon = require('sinon')

const MockAPI = require('mehpi')
const bigPoppaAPI = new MockAPI('5678')

const MultipleOrganizationsFixture = require('../../fixtures/big-poppa/organizations')
const OrganizationFixture = require('../../fixtures/big-poppa/organization')

if (process.env.TEST_STUB_OUT_BIG_POPPA) {
  process.env.BIG_POPPA_HOST = '127.0.0.1:5678'
}

const bigPoppa = require('util/big-poppa')
const runnableAPI = require('util/runnable-api-client')
const stripe = require('util/stripe')

const testUtil = require('../../util')

const workerServer = require('workers/server')
const httpServer = require('http/server')

describe('#organiztion.plan.start-trial Integration Test', () => {
  let orgId = OrganizationFixture.id
  let orgGithubId = OrganizationFixture.githubId
  let userGithubId = 1981198
  let stripeCustomerId
  let stripeSubscriptionId
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

  // RabbitMQ
  before('Connect to RabbitMQ', () => {
    return testUtil.connectToRabbitMQ(workerServer, [], [])
      .then(p => { publisher = p })
  })
  after('Disconnect from RabbitMQ', () => {
    return testUtil.disconnectToRabbitMQ(publisher, workerServer)
  })

  before('Spy on updateOrganization', () => {
    updateOrganizationSpy = sinon.spy(bigPoppa, 'updateOrganization')
  })
  after('Restore updateOrganization', () => {
    updateOrganizationSpy.restore()
  })

  before('Stub out big-poppa calls', () => {
    bigPoppaAPI.stub('GET', `/organization/${orgId}`).returns({
      status: 200,
      body: OrganizationFixture
    })
    bigPoppaAPI.stub('GET', `/organization/?githubId=${orgGithubId}`).returns({
      status: 200,
      body: MultipleOrganizationsFixture
    })
    bigPoppaAPI.stub('PATCH', `/organization/${orgId}`).returns({
      status: 200,
      body: OrganizationFixture
    })
  })

  after('Clean up Stripe', () => {
    // Deleting the customer deletes the subscription
    return stripe.stripeClient.customers.del(stripeCustomerId)
  })

  /**
   * Tests are meant to be run sequentially. Might not work with `.only`
   */

  it('should delete the organization', function () {
    if (process.env.TEST_STUB_OUT_BIG_POPPA) return this.skip()

    publisher.publishTask('organization.delete', {
      githubId: orgGithubId
    })
    return Promise.delay(1000)
  })

  it('should create an organization', function () {
    if (process.env.TEST_STUB_OUT_BIG_POPPA) return this.skip()

    publisher.publishTask('organization.create', {
      githubId: orgGithubId,
      creator: {
        githubId: userGithubId,
        githubUsername: 'thejsj',
        email: 'jorge@runnable.com',
        created: (new Date()).getTime()
      }
    })
  })

  it('should trigger organization created', function () {
    if (!process.env.TEST_STUB_OUT_BIG_POPPA) return this.skip()

    publisher.publishEvent('organization.created', {
      organization: {
        id: orgId,
        githubId: orgGithubId
      },
      user: {
        id: OrganizationFixture.users[0].id,
        githubId: OrganizationFixture.users[0].githubId
      }
    })
  })

  it('should have created the customer in Stripe', function () {
    this.timeout(5000)
    const checkCustomerCreated = Promise.method(() => {
      if (updateOrganizationSpy.called) {
        return true
      }
      return false
    })
    return testUtil.poll(checkCustomerCreated, 100, 5000)
      .delay(1000)
      .then(function checkStripe () {
        stripeCustomerId = updateOrganizationSpy.firstCall.args[1].stripeCustomerId
        stripeSubscriptionId = updateOrganizationSpy.firstCall.args[1].stripeSubscriptionId
        return stripe.stripeClient.customers.retrieve(stripeCustomerId)
          .then(stripeCustomer => {
            expect(stripeCustomer.description).to.include(OrganizationFixture.id)
            expect(stripeCustomer.description).to.include(OrganizationFixture.githubId)
            let metadata = stripeCustomer.metadata
            expect(metadata).to.have.property('organizationId', OrganizationFixture.id.toString())
            expect(metadata).to.have.property('githubId', OrganizationFixture.githubId.toString())
          })
          .then(function fetchSubscriptions () {
            return stripe.stripeClient.subscriptions.list({ customer: stripeCustomerId })
          })
          .then(function checkSubscription (res) {
            let subscriptions = res.data
            expect(subscriptions).to.be.an('array')
            expect(subscriptions).to.have.lengthOf(1)
            let subscription = subscriptions[0]
            expect(subscription).to.be.an('object')
            expect(subscription.id).to.equal(stripeSubscriptionId)
            expect(subscription.trial_end).to.be.above((new Date()).getTime() / 1000)
            expect(subscription.plan.id).to.be.a.match(/runnable/i)
            let usersMetadata = JSON.parse(subscription.metadata.users)
            expect(usersMetadata).to.be.an('array')
            expect(usersMetadata).to.have.lengthOf(3)
            expect(usersMetadata[0]).to.equal(OrganizationFixture.users[0].githubId)
          })
      })
  })

  it('should assert that the organization was created', function () {
    if (process.env.TEST_STUB_OUT_BIG_POPPA) return this.skip()

    this.timeout(5000)
    const fetchOrganizationWithStripeCustomerId = () => {
      return bigPoppa.getOrganizations({ githubId: orgGithubId })
        .then(orgs => {
          if (!orgs[0] || !orgs[0].stripeCustomerId) return false
          return orgs[0]
        })
    }
    return testUtil.poll(fetchOrganizationWithStripeCustomerId, 100, 5000)
  })

  it('should start the trial for an organization', function () {
    if (process.env.TEST_STUB_OUT_BIG_POPPA) return this.skip()

    return bigPoppa.getOrganizations({ githubId: orgGithubId })
      .then(function assertProperties (orgs) {
        let org = orgs[0]
        expect(org).to.have.property('stripeCustomerId')
        expect(org).to.have.property('stripeSubscriptionId')
        expect(org).to.have.property('allowed', true)
        expect(org).to.have.property('isPastTrial', false)
        expect(org).to.have.property('isPastActivePeriod', true)
      })
  })
})
