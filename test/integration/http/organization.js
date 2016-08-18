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
  let cardNumber = '4242424242424242'
  let cardExpMonth = 12
  let cardExpYear = 2017

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
    let org = Object.assign({}, OrganizationWithStripeCustomerIdFixture)
    let orgId = org.id
    let orgGithubId = org.githubId
    let stripeCustomerId
    let stripeTokenId
    let stripeCardId
    let userId = org.users[0].id
    let userGithubId = org.users[0].githubId

    before('Create customer', () => {
      return stripe.stripeClient.customers.create({
        description: `Customer for organizationId: ${orgId} / githubId: ${orgGithubId}`
      })
      .then(stripeCustomer => {
        stripeCustomerId = stripeCustomer.id
        return stripe.stripeClient.tokens.create({
          card: {
            number: cardNumber,
            exp_month: cardExpMonth,
            exp_year: cardExpYear,
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
      org.stripeCustomerId = stripeCustomerId
      bigPoppaAPI.stub('GET', `/organization/${orgId}`).returns({
        status: 200,
        body: org
      })
      bigPoppaAPI.stub('PATCH', `/organization/${orgId}`).returns({
        status: 201,
        body: org
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

  describe('#getPaymentMethod', () => {
    let orgId = OrganizationWithStripeCustomerIdFixture.id
    let orgGithubId = OrganizationWithStripeCustomerIdFixture.githubId
    let stripeCustomerId
    let stripeTokenId
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
            number: cardNumber,
            exp_month: cardExpMonth,
            exp_year: cardExpYear,
            cvc: '123'
          }
        })
      })
      .then(stripeToken => {
        stripeTokenId = stripeToken.id
        // stripeCardId = stripeToken.card.id
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
      bigPoppaAPI.stub('PATCH', `/organization/${orgId}`).returns({
        status: 201,
        body: OrganizationWithStripeCustomerIdFixture
      })
      bigPoppaAPI.start(done)
    })
    after(done => {
      bigPoppaAPI.stop(done)
    })

    it('should get the current payment method', () => {
      return request
        .post(`http://localhost:${process.env.PORT}/organization/${orgId}/payment-method`)
        .type('json')
        .send({ stripeToken: stripeTokenId, user: { id: userId } })
        .then(() => {
          return request.get(`http://localhost:${process.env.PORT}/organization/${orgId}/payment-method/`)
        })
        .then(res => {
          let body = res.body
          expect(body).to.be.an('object')
          expect(body.card).to.be.an('object')
          expect(body.owner).to.be.an('object')
          let card = body.card
          let owner = body.owner
          expect(card).to.have.property('object', 'card')
          expect(card).to.have.property('expMonth', cardExpMonth)
          expect(card).to.have.property('expYear', cardExpYear)
          expect(card).to.have.property('last4', cardNumber.substr(cardNumber.length - 4))
          expect(card).to.have.property('brand', 'Visa')
          expect(owner).to.have.property('id', userId.toString())
          expect(owner).to.have.property('githubId', userGithubId.toString())
        })
    })
  })

  describe('#getPlans', () => {
    let org = Object.assign({}, OrganizationWithStripeCustomerIdFixture)
    let orgId = org.id
    let orgGithubId = org.githubId
    let stripeCustomerId
    let planId = 'runnable-plus'

    before('Create customer', () => {
      return stripe.stripeClient.customers.create({
        description: `Customer for organizationId: ${orgId} / githubId: ${orgGithubId}`
      })
      .then(stripeCustomer => {
        stripeCustomerId = stripeCustomer.id
        return stripe.stripeClient.subscriptions.create({
          customer: stripeCustomerId,
          plan: planId,
          metadata: {
            users: JSON.stringify(['123', '456', 'ADDED_USER_TO_MEET_MINIMUM'])
          }
        })
      })
    })
    after('Clean up Stripe', () => {
      // Deleting the customer deletes the subscription
      return stripe.stripeClient.customers.del(stripeCustomerId)
    })

    // Big Poppa Mock
    before('Stub out big-poppa calls', done => {
      // Update customer ID in order to be able to query subscription correctly
      org.stripeCustomerId = stripeCustomerId
      bigPoppaAPI.stub('GET', `/organization/${orgId}`).returns({
        status: 200,
        body: org
      })
      bigPoppaAPI.start(done)
    })
    after(done => bigPoppaAPI.stop(done))

    it('should fetch the plans', () => {
      return request
        .get(`http://localhost:${process.env.PORT}/organization/${orgId}/plan`)
        .then(res => {
          expect(res.body).to.have.deep.property('current')
          expect(res.body).to.have.deep.property('next')
          let currentPlan = res.body.current
          let nextPlan = res.body.next
          expect(currentPlan).to.be.an('object')
          expect(nextPlan).to.be.an('object')

          expect(currentPlan).to.have.property('id', planId)
          expect(currentPlan.price).to.be.a('number')
          expect(currentPlan.maxConfigurations).to.be.a('number')
          expect(currentPlan.userCount).to.be.a('number')

          expect(nextPlan).to.have.property('id')
          expect(nextPlan.price).to.be.a('number')
          expect(nextPlan.maxConfigurations).to.be.a('number')
          expect(nextPlan.userCount).to.be.a('number')
        })
    })
  })
})
