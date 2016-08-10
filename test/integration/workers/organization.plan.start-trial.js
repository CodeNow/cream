'use strict'

const Promise = require('bluebird')
const expect = require('chai').expect
// const sinon = require('sinon')
// require('sinon-as-promised')(Promise)

const MockAPI = require('mehpi')
const bigPoppaAPI = new MockAPI('5678')

const RabbitMQ = require('ponos/lib/rabbitmq')
const bigPoppa = require('util/big-poppa')
const runnableAPI = require('util/runnable-api-client')

const testUtil = require('../../util')

const workerServer = require('workers/server')
const httpServer = require('http/server')

describe.only('#organiztion.plan.start-trial Integration Test', () => {
  let orgId = 66
  let userId = 67
  let orgGithubId = 2828361
  let userGithubId = 1981198
  let publisher

  // HTTP
  before('Start HTTP server', () => httpServer.start())
  after('Stop HTTP server', () => httpServer.stop())

  // Workers
  before('Start worker server', () => workerServer.start())
  after('Stop worker server', () => workerServer.stop())

  // Runnable API Client
  before('Login into runnable API', () => runnableAPI.login())
  after('Logout into runnable API', () => runnableAPI.logout())

  // Big Poppa Mock
  before(done => bigPoppaAPI.start(done))
  after(done => bigPoppaAPI.stop(done))

  // Connect to RabbitMQ
  before('Connect to RabbitMQ', () => {
    publisher = new RabbitMQ({
      name: process.env.APP_NAME + '-test',
      hostname: process.env.RABBITMQ_HOSTNAME,
      port: process.env.RABBITMQ_PORT,
      username: process.env.RABBITMQ_USERNAME,
      password: process.env.RABBITMQ_PASSWORD
    })
    return publisher.connect()
  })
  after('Disconnect from RabbitMQ', () => publisher.disconnect())

  before('Stub out big-poppa calls', () => {
    bigPoppaAPI.stub('GET', `/organization/${orgId}`).returns({
      status: 200,
      body: {
        id: 66,
        githubId: 2828361,
        createdAt: '2016-08-10T17:45:58.182Z',
        updatedAt: '2016-08-10T17:45:59.772Z',
        stripeCustomerId: 'cus_8yyjnMNQa5NBse',
        trialEnd: '1472060759',
        activePeriodEnd: '1470851158',
        gracePeriodEnd: '1472319959',
        isActive: true,
        firstDockCreated: false,
        users: [ { githubId: userGithubId } ],
        isPastTrial: false,
        isPastActivePeriod: true,
        isPastGracePeriod: false,
        allowed: true
      }
    })
    bigPoppaAPI.stub('GET', `/organization/?githubId=${orgGithubId}`).returns({
      status: 200,
      body: [{
        id: 66,
        githubId: 2828361,
        createdAt: '2016-08-10T17:45:58.182Z',
        updatedAt: '2016-08-10T17:45:59.772Z',
        stripeCustomerId: 'cus_8yyjnMNQa5NBse',
        trialEnd: '1472060759',
        activePeriodEnd: '1470851158',
        gracePeriodEnd: '1472319959',
        isActive: true,
        firstDockCreated: false,
        users: [ { githubId: userGithubId } ],
        isPastTrial: false,
        isPastActivePeriod: true,
        isPastGracePeriod: false,
        allowed: true
      }]
    })
  })

  /**
   * Tests are meant to be run sequentially. Might not work with `.only`
   */

  it('should delete the organization', function () {
    if (!process.env.TEST_STUB_OUT_BIG_POPPA) return this.skip()

    publisher.publishTask('organization.delete', {
      githubId: orgGithubId
    })
    return Promise.delay(1000)
  })

  it('should create an organization', function () {
    if (!process.env.TEST_STUB_OUT_BIG_POPPA) return this.skip()

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
    if (process.env.TEST_STUB_OUT_BIG_POPPA) return this.skip()

    publisher.publishTask('cream.organization.created', {
      organization: {
        id: 88,
        githubId: orgGithubId
      },
      user: {
        id: 98,
        githubId: userGithubId
      }
    })
  })

  it('should assert that the organization was created', function () {
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
    if (!process.env.TEST_STUB_OUT_BIG_POPPA) return this.skip()
    console.log('----', process.env.TEST_STUB_OUT_BIG_POPPA)

    return bigPoppa.getOrganizations({ githubId: orgGithubId })
      .then(function assertProperties (orgs) {
        let org = orgs[0]
        expect(org).to.have.property('stripeCustomerId')
        expect(org).to.have.property('allowed', true)
        expect(org).to.have.property('isPastTrial', false)
        expect(org).to.have.property('isPastActivePeriod', true)
      })
  })
})
