'use strict'
require('loadenv')()

const Promise = require('bluebird')
const expect = require('chai').expect

const superagentPromisePlugin = require('superagent-promise-plugin')
const request = superagentPromisePlugin.patch(require('superagent'))
superagentPromisePlugin.Promise = Promise

const MockAPI = require('mehpi')
const bigPoppaAPI = new MockAPI('5678')

const OrganizationWithStripeCustomerIdFixture = require('../../fixtures/big-poppa/organization-with-stripe-customer-id')

if (process.env.TEST_STUB_OUT_BIG_POPPA) {
  process.env.BIG_POPPA_HOST = '127.0.0.1:5678'
}

const RabbitMQ = require('ponos/lib/rabbitmq')
const runnableAPI = require('util/runnable-api-client')
const stripe = require('util/stripe')

const workerServer = require('workers/server')
const httpServer = require('http/server')

describe('OrganizationRouter Integration Test', () => {
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

  describe('#postPaymentMethod', () => {
    let orgId = OrganizationWithStripeCustomerIdFixture.id
    let orgGithubId = OrganizationWithStripeCustomerIdFixture.githubId
    let stripeCustomerId
    let stripeTokenId
    let stripeCardId
    let userId = OrganizationWithStripeCustomerIdFixture.users[0].id
    let userGithubId = OrganizationWithStripeCustomerIdFixture.users[0].githubId

    before('Create customer', () => {
      return stripe.stripeClient.customers.create({
        description: `Customer for organizationId: ${orgId} / githubId: ${orgGithubId}`
      })
      .then(stripeCustomer => {
        stripeCustomerId = stripeCustomer.id
        return stripe.stripeClient.tokens.create({
          card: {
            number: '4242424242424242',
            exp_month: 12,
            exp_year: 2017,
            cvc: '123'
          }
        })
      })
      .then(stripeToken => {
        stripeTokenId = stripeToken.id
        stripeCardId = stripeToken.card.id
      })
    })
    after('Clean up Stripe', () => {
      // Deleting the customer deletes the subscription
      return stripe.stripeClient.customers.del(stripeCustomerId)
    })

    // Big Poppa Mock
    before('Stub out big-poppa calls', done => {
      // Update customer ID in order to be able to query subscription correctly
      OrganizationWithStripeCustomerIdFixture.stripeCustomerId = stripeCustomerId
      bigPoppaAPI.stub('GET', `/organization/${orgId}`).returns({
        status: 200,
        body: OrganizationWithStripeCustomerIdFixture
      })
      bigPoppaAPI.start(done)
    })
    after(done => {
      bigPoppaAPI.stop(done)
    })

    it('should change the payment method for an organization', () => {
      return request
        .post(`http://localhost:${process.env.PORT}/organization/${orgId}/payment-method`)
        .type('json')
        .send({ stripeToken: stripeTokenId, user: { id: userId } })
        .then(() => {
          return stripe.stripeClient.customers.retrieve(stripeCustomerId)
        })
        .then(stripeCustomer => {
          expect(stripeCustomer).to.have.deep.property('metadata.paymentMethodOwnerId', userId.toString())
          expect(stripeCustomer).to.have.deep.property('metadata.paymentMethodOwnerGithubId', userGithubId.toString())
          expect(stripeCustomer).to.have.property('default_source', stripeCardId)
        })
    })
  })
})
