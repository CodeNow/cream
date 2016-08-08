'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
const expect = require('chai').expect
require('sinon-as-promised')(Promise)

const Stripe = require('util/stripe')
const stripeClient = Stripe.stripeClient
// const runnableClient = require('util/runnable-api-client')

describe.only('Stripe', function () {
  let orgMock
  let orgId = 123
  let githubId = 23423
  let stripeCustomerId = 'cust_23423'

  beforeEach('Create mock for org', () => {
    orgMock = {
      id: orgId,
      githubId: githubId,
      stripeCustomerId: stripeCustomerId
    }
  })

  describe('createCustomerAndSubscriptionForOrganization', () => {

  })

  describe('updateUsersForPlan', () => {

  })

  describe('getPlanIdForOrganizationBasedOnCurrentUsage', () => {

  })

  describe('getSubscriptionForOrganization', () => {

  })

  describe('_createCustomer', () => {
    let createCustomerStub
    let customer

    beforeEach('stub out Stripe API calls', () => {
      customer = {}
      createCustomerStub = sinon.stub(stripeClient.customers, 'create').resolves(customer)
    })

    afterEach('restore Stripe API calls', () => {
      createCustomerStub.restore()
    })

    it('should create a customer in Stripe', () => {
      return Stripe._createCustomer(orgMock)
        .then(res => {
          expect(res).to.equal(customer)
          sinon.assert.calledOnce(createCustomerStub)
          sinon.assert.calledWithExactly(
            createCustomerStub,
            {
              description: `Customer for organizationId: ${orgMock.id} / githubId: ${orgMock.githubId}`,
              metadata: {
                organizationId: orgMock.id,
                githubId: orgMock.githubId
              }
            }
          )
        })
    })

    it('should throw any errors', done => {
      let thrownErr = new Error('hello')
      createCustomerStub.rejects(thrownErr)

      Stripe._createCustomer(orgMock)
        .asCallback(err => {
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('_createSubscription', () => {
    let createSubscriptionStub
    let subscription
    let planId = 'runnable-basic'
    let generateObjectForUsersStub
    let users

    beforeEach('stub out Stripe API calls', () => {
      subscription = {}
      users = [{ githubId: 1232 }]
      createSubscriptionStub = sinon.stub(stripeClient.subscriptions, 'create').resolves(subscription)
      generateObjectForUsersStub = sinon.spy(Stripe, '_getUpdateObjectForUsers')
    })

    afterEach('restore Stripe API calls', () => {
      createSubscriptionStub.restore()
      generateObjectForUsersStub.restore()
    })

    it('should create a subscription in Stripe', () => {
      return Stripe._createSubscription(stripeCustomerId, users, planId)
        .then(res => {
          expect(res).to.equal(subscription)
          sinon.assert.calledOnce(createSubscriptionStub)
          sinon.assert.calledWithExactly(
            createSubscriptionStub,
            {
              customer: stripeCustomerId,
              plan: planId,
              quantity: sinon.match.number,
              metadata: sinon.match.object
            }
          )
        })
    })

    it('should call `_getUpdateObjectForUsers`', () => {
      return Stripe._createSubscription(stripeCustomerId, users, planId)
        .then(res => {
          sinon.assert.calledOnce(generateObjectForUsersStub)
          sinon.assert.calledWithExactly(
            generateObjectForUsersStub,
            users
          )
        })
    })

    it('should throw any errors', done => {
      let thrownErr = new Error('hello')
      createSubscriptionStub.rejects(thrownErr)

      Stripe._createSubscription(stripeCustomerId, users, planId)
        .asCallback(err => {
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('_updateUsersForPlan', () => {
    let updateCustomerStub
    let customer
    let subscriptionId = 23423
    let users

    beforeEach('stub out Stripe API calls', () => {
      customer = {}
      users = [{ githubId: 1232 }]
      updateCustomerStub = sinon.stub(stripeClient.subscriptions, 'update').resolves(customer)
    })

    afterEach('restore Stripe API calls', () => {
      updateCustomerStub.restore()
    })

    it('should create a customer in Stripe', () => {
      return Stripe._updateUsersForPlan(subscriptionId, users)
        .then(res => {
          expect(res).to.equal(customer)
          sinon.assert.calledOnce(updateCustomerStub)
          sinon.assert.calledWithExactly(
            updateCustomerStub,
            subscriptionId,
            {
              quantity: sinon.match.number,
              metadata: sinon.match.object
            }
          )
        })
    })

    it('should throw any errors', done => {
      let thrownErr = new Error('hello')
      updateCustomerStub.rejects(thrownErr)

      Stripe._updateUsersForPlan(subscriptionId, users)
        .asCallback(err => {
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('_getUpdateObjectForUsers', () => {
  })

  describe('_generatePlanUsersForOrganization', () => {
  })
})
