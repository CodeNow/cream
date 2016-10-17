'use strict'
require('loadenv')()

const Promise = require('bluebird')
const expect = require('chai').expect
const moment = require('moment')

const stripeClient = require('util/stripe').stripeClient

const superagentPromisePlugin = require('superagent-promise-plugin')
const request = superagentPromisePlugin.patch(require('superagent'))
superagentPromisePlugin.Promise = Promise

const MockAPI = require('mehpi')
const bigPoppaAPI = new MockAPI('5678')

const OrganizationWithStripeCustomerIdFixture = require('../../fixtures/big-poppa/organization-with-stripe-customer-id')

if (process.env.TEST_STUB_OUT_BIG_POPPA) {
  process.env.BIG_POPPA_HOST = '127.0.0.1:5678'
}

const testUtil = require('../../util')
const runnableAPI = require('util/runnable-api-client')
const rabbitmq = require('util/rabbitmq')
const stripe = require('util/stripe')

const workerServer = require('workers/server')
const httpServer = require('http/server')

describe('OrganizationRouter Integration Test', () => {
  let publisher
  let cardNumber = '4242424242424242'
  let cardExpMonth = 12
  let cardExpYear = 2017
  const oneWeekFromNow = moment().add(7, 'days')

  // HTTP
  before('Start HTTP server', () => httpServer.start())
  after('Stop HTTP server', () => httpServer.stop())

  // Runnable API Client
  before('Login into runnable API', () => runnableAPI.login())
  after('Logout into runnable API', () => runnableAPI.logout())

  // RabbitMQ Client
  before('Connect to RabbitMQ', () => rabbitmq.connect())
  after('Disconnect from RabbitMQ', () => rabbitmq.disconnect())

  // RabbitMQ
  before('Connect to RabbitMQ', () => {
    return testUtil.connectToRabbitMQ(workerServer, [], [])
      .then(p => { publisher = p })
  })
  after('Disconnect from RabbitMQ', function () {
    this.timeout(5000)
    return testUtil.disconnectToRabbitMQ(publisher, workerServer)
      .then(() => testUtil.deleteAllExchangesAndQueues())
  })

  describe('#postPaymentMethod', () => {
    let org = Object.assign({}, OrganizationWithStripeCustomerIdFixture)
    let orgId = org.id
    let stripeCustomerId
    let stripeSubscriptionId
    let stripeTokenId
    let stripeCardId
    let userId = org.users[0].id
    let userGithubId = org.users[0].githubId
    let userEmail = 'jorge@runnable.com'

    before('Create customer', function () {
      this.timeout(4000)
      return testUtil.createCustomerAndSubscription(org, { trialEnd: oneWeekFromNow.format('X') })
      .then(function (res) {
        stripeCustomerId = res.customer.id
        stripeSubscriptionId = res.subscription.id
        return stripe.stripeClient.tokens.create({
          card: {
            number: cardNumber,
            exp_month: cardExpMonth,
            exp_year: cardExpYear,
            cvc: '123'
          }
        })
      })
      .then(function (stripeToken) {
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
      org.stripeSubscriptionId = stripeSubscriptionId
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
        .send({ stripeToken: stripeTokenId, user: { id: userId, email: userEmail } })
        .then(() => {
          return stripe.stripeClient.customers.retrieve(stripeCustomerId)
        })
        .then(stripeCustomer => {
          expect(stripeCustomer).to.have.deep.property('metadata.paymentMethodOwnerId', userId.toString())
          expect(stripeCustomer).to.have.deep.property('metadata.paymentMethodOwnerGithubId', userGithubId.toString())
          expect(stripeCustomer).to.have.property('default_source', stripeCardId)
          expect(stripeCustomer).to.have.property('email', userEmail)
        })
    })
  })

  describe('#getPaymentMethod', () => {
    let org = Object.assign({}, OrganizationWithStripeCustomerIdFixture)
    const orgId = org.id
    let stripeCustomerId
    let stripeSubscriptionId
    let stripeTokenId
    let userId = OrganizationWithStripeCustomerIdFixture.users[0].id
    let userGithubId = OrganizationWithStripeCustomerIdFixture.users[0].githubId
    let userEmail = 'jorge@runnable.com'

    before('Create customer', () => {
      return testUtil.createCustomerAndSubscription(org, { trialEnd: oneWeekFromNow.format('X') })
      .then(function (res) {
        stripeCustomerId = res.customer.id
        stripeSubscriptionId = res.subscription.id
        return stripe.stripeClient.tokens.create({
          card: {
            number: cardNumber,
            exp_month: cardExpMonth,
            exp_year: cardExpYear,
            cvc: '123'
          }
        })
      })
      .then(function (stripeToken) {
        stripeTokenId = stripeToken.id
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
      OrganizationWithStripeCustomerIdFixture.stipreSubscriptionId = stripeSubscriptionId
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
        .send({ stripeToken: stripeTokenId, user: { id: userId, email: userEmail } })
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
          expect(owner).to.have.property('id', userId)
          expect(owner).to.have.property('githubId', userGithubId)
          expect(owner).to.have.property('email', userEmail)
        })
    })
  })

  describe('#getPlans', () => {
    let org = Object.assign({}, OrganizationWithStripeCustomerIdFixture)
    let orgId = org.id
    let stripeCustomerId
    let stripeSubscriptionId
    let planId = 'runnable-plus'

    before('Create customer', function () {
      this.timeout(5000)
      return testUtil.createCustomerAndSubscriptionWithPaymentMethod(org, {
        plan: planId,
        users: ['123', '456', 'ADDED_USER_TO_MEET_MINIMUM'],
        coupon: 'Beta'
      })
      .then(function (res) {
        stripeCustomerId = res.customer.id
        stripeSubscriptionId = res.subscription.id
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
      org.stripeSubscriptionId = stripeSubscriptionId
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
          expect(res.body).to.have.deep.property('discount')
          let currentPlan = res.body.current
          let nextPlan = res.body.next
          let discount = res.body.discount
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

          expect(discount.end).to.be.a('string')
          expect(discount.start).to.be.a('string')
          expect(discount.coupon).to.be.an('object')
          // Values might change if the coupon is updated
          expect(discount.coupon.duration).to.equal('repeating')
          expect(discount.coupon.percentOff).to.equal(50)
          expect(discount.coupon.durationInMonths).to.equal(6)
        })
    })
  })

  describe('#getInvoices', () => {
    let org = Object.assign({}, OrganizationWithStripeCustomerIdFixture)
    let orgId = org.id
    let stripeCustomerId
    let stripeInvoice
    let userId = OrganizationWithStripeCustomerIdFixture.users[0].id
    let userGithubId = OrganizationWithStripeCustomerIdFixture.users[0].githubId

    before('Create customer, subscription, invoice and get event', function () {
      this.timeout(5000)
      return testUtil.createCustomerAndSubscriptionWithPaymentMethod(org)
      .then(function (res) {
        stripeCustomerId = res.customer.id
      })
      .then(function findInvoice (stripeSubscription) {
        // Find the invoice for charge
        return stripeClient.invoices.list({
          customer: stripeCustomerId
        })
      })
      .then(res => {
        stripeInvoice = res.data[0]
        return stripeInvoice
      })
      .then(invoice => {
        return stripeClient.invoices.update(invoice.id, {
          metadata: {
            paymentMethodOwnerId: userId,
            paymentMethodOwnerGithubId: userGithubId
          }
        })
      })
    })
    after('Clean up Stripe', () => {
      // Deleting the customer deletes the subscription
      return stripeClient.customers.del(stripeCustomerId)
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
    after(done => {
      bigPoppaAPI.restore()
      bigPoppaAPI.stop(done)
    })

    it('should fetch all invoices for an organization', () => {
      return request
        .get(`http://localhost:${process.env.PORT}/organization/${orgId}/invoices`)
        .then(res => {
          expect(res).to.have.deep.property('body.invoices')
          expect(res.body.invoices).to.be.an('array')
          expect(res.body.invoices).to.have.lengthOf(1)
          let invoice = res.body.invoices[0]
          expect(invoice).to.have.deep.property('paidBy.id', userId)
          expect(invoice).to.have.deep.property('paidBy.githubId', userGithubId)
          expect(invoice).to.have.property('total')
          expect(invoice).to.have.property('periodEnd')
        })
    })
  })
})
