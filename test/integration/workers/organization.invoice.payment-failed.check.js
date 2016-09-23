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

describe('#organizations.invoice.payment-failed.check Integration Test', () => {
  const trialEnd = moment().subtract(26, 'hours')
  const futureTrialEnd = moment().add(3, 'hours')
  // Trial Invoice
  const org1 = Object.assign({}, OrganizationWithStripeCustomerIdFixture, { id: 1, githubId: 10224621, futureTrialEnd })
  // Real Invoice
  const org2 = Object.assign({}, OrganizationWithStripeCustomerIdFixture, { id: 2, githubId: 2828361, trialEnd })
  // Failed Invoice (notified)
  const org3 = Object.assign({}, OrganizationWithStripeCustomerIdFixture, { id: 3, githubId: 2335750, trialEnd })
  // No Payment Method
  const org4 = Object.assign({}, OrganizationWithStripeCustomerIdFixture, { id: 4, githubId: 9487339, trialEnd })
  const org3Id = org3.id
  const org3Name = org3.name
  let org3SCustomerId
  let org3InvoiceId
  let publisher

  let updateNotifiedAllMembersPaymentFailedStub
  let getCurrentInvoiceForOrganizationStub
  let publishEventStub
  const org3paymentMethodOwnerGithubId = 718305
  const org3paymentMethodOwner = { id: 2, githubId: org3paymentMethodOwnerGithubId }

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
    return testUtil.connectToRabbitMQ(workerServer, ['organizations.invoice.payment-failed.check'], [])
      .then(p => { publisher = p })
  })
  after('Disconnect from RabbitMQ', () => {
    return testUtil.disconnectToRabbitMQ(publisher, workerServer)
  })

  before('Spy on calls', () => {
    updateNotifiedAllMembersPaymentFailedStub = sinon.spy(stripe.invoices, 'updateNotifiedAllMembersPaymentFailed')
    publishEventStub = sinon.spy(rabbitmq, 'publishEvent')
  })
  after('Restore spies', () => {
    updateNotifiedAllMembersPaymentFailedStub.restore()
    publishEventStub.restore()
  })

  before('Create customer and subscription', function () {
    this.timeout(10000)
    return Promise.all([
      testUtil.createCustomerAndSubscriptionWithPaymentMethod(org1, +futureTrialEnd.format('X')), // In Trial
      testUtil.createCustomerAndSubscriptionWithPaymentMethod(org2, 'now'),
      testUtil.createCustomerAndSubscriptionWithPaymentMethod(org3, 'now', org3paymentMethodOwner),
      testUtil.createCustomerAndSubscription(org4, {}) // No Payment method
    ])
      .each(res => {
        return stripe.stripeClient.invoices.list({
          customer: res.customer.id
        })
        .then(invoicesRes => {
          let firstInvoice = invoicesRes.data[0]
          if (firstInvoice.customer === org3SCustomerId) {
            org3InvoiceId = firstInvoice.id
          }
          return stripe.stripeClient.invoices.update(firstInvoice.id, {
            metadata: {
              notifiedAdminPaymentFailed: moment().toISOString()
            }
          })
        })
      })
      .spread((res1, res2, res3, res4) => {
        org3SCustomerId = res3.customer.id
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
   * Testing failed invoices is hard with Stripe (Takes 2-3 minutes for them
   * to be created). Instead, stub out the function to get the current invoice
   * and just change the `paid` valude to faled
   */
  before('Stub out getCurrentInvoiceForOrganization', () => {
    let _getCurrentInvoiceForOrganizationStub = stripe.invoices.getCurrentInvoiceForOrganization.bind(stripe)
    getCurrentInvoiceForOrganizationStub = sinon.stub(stripe.invoices, 'getCurrentInvoiceForOrganization', (org) => {
      return _getCurrentInvoiceForOrganizationStub(org)
      .tap((invoice) => {
        if (invoice.customer === org3SCustomerId) {
          invoice.paid = false
        }
      })
    })
  })
  after('Restore getCurrentInvoiceForOrganization', () => {
    getCurrentInvoiceForOrganizationStub.restore()
  })

  // Big Poppa Mock
  before('Stub out big-poppa calls', done => {
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

  it('should publish the `organiztion.invoice.payment-failed.check` event', function () {
    this.timeout(5000)
    publisher.publishTask('organizations.invoice.payment-failed.check', {})

    const checkCustomerCreated = Promise.method(() => {
      // Check if spy has been called
      return !!updateNotifiedAllMembersPaymentFailedStub.called
    })
    return testUtil.poll(checkCustomerCreated, 100, 5000)
      .delay(1000)
      .then(function checkStripeForUpdatePlan () {
        // Assert the event was published
        sinon.assert.calledOnce(publishEventStub)
        sinon.assert.calledWith(publishEventStub, 'organization.invoice.payment-failed', {
          invoicePaymentHasFailedFor24Hours: true,
          organization: {
            id: org3Id,
            name: org3Name
          },
          paymentMethodOwner: {
            githubId: org3paymentMethodOwnerGithubId
          },
          tid: sinon.match.any
        })
        // Assert Stripe was updated
        return stripe.stripeClient.invoices.retrieve(org3InvoiceId)
          .then(invoice => {
            expect(invoice).to.have.deep.property('metadata.notifiedAllMembersPaymentFailed')
          })
      })
  })
})
