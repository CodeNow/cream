'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
const expect = require('chai').expect
require('sinon-as-promised')(Promise)

const runnableClient = require('util/runnable-api-client')
const Stripe = require('util/stripe')
const stripeClient = Stripe.stripeClient

const EntityExistsInStripeError = require('errors/entity-exists-error')
const EntityNotFoundError = require('errors/entity-not-found-error')

describe('Stripe', function () {
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
    let orgMockNotInStripe
    let createCustomerStub
    let getPlanIdStub
    let createSubscriptionStub
    let users
    let planId = 'runnable-basic'
    let stripeSubscription
    let stripeCustomer

    beforeEach('Create mock for org', () => {
      users = []
      orgMockNotInStripe = {
        id: orgId,
        githubId: githubId,
        users: users
      }
      stripeCustomer = {
        id: stripeCustomerId
      }
      stripeSubscription = {}
    })

    beforeEach('Stub out method', () => {
      createCustomerStub = sinon.stub(Stripe, '_createCustomer').resolves(stripeCustomer)
      getPlanIdStub = sinon.stub(Stripe, 'getPlanIdForOrganizationBasedOnCurrentUsage').resolves(planId)
      createSubscriptionStub = sinon.stub(Stripe, '_createSubscription').resolves(stripeSubscription)
    })

    afterEach('Restore stub', () => {
      createCustomerStub.restore()
      getPlanIdStub.restore()
      createSubscriptionStub.restore()
    })

    it('should throw an error if the org already has a `stripeCustomerId`', done => {
      orgMockNotInStripe.stripeCustomerId = stripeCustomerId

      return Stripe.createCustomerAndSubscriptionForOrganization(orgMockNotInStripe)
        .asCallback(err => {
          expect(err).to.be.an.instanceof(EntityExistsInStripeError)
          expect(err.message).to.include(orgId)
          done()
        })
    })

    it('should get the plan id for an organization at its current state', () => {
      return Stripe.createCustomerAndSubscriptionForOrganization(orgMockNotInStripe)
        .then(() => {
          sinon.assert.calledOnce(getPlanIdStub)
          sinon.assert.calledWithExactly(
            getPlanIdStub,
            githubId
          )
        })
    })

    it('should create the customer in Stripe', () => {
      return Stripe.createCustomerAndSubscriptionForOrganization(orgMockNotInStripe)
        .then(() => {
          sinon.assert.calledOnce(createCustomerStub)
          sinon.assert.calledWithExactly(
            createCustomerStub,
            orgMockNotInStripe
          )
        })
    })

    it('should create a subscription', () => {
      return Stripe.createCustomerAndSubscriptionForOrganization(orgMockNotInStripe)
        .then(() => {
          sinon.assert.calledOnce(createSubscriptionStub)
          sinon.assert.calledWithExactly(
            createSubscriptionStub,
            stripeCustomerId,
            users,
            planId
          )
        })
    })

    it('should return the customer and the subscription', () => {
      return Stripe.createCustomerAndSubscriptionForOrganization(orgMockNotInStripe)
        .then(res => {
          expect(res.customer).to.equal(stripeCustomer)
          expect(res.subscription).to.equal(stripeSubscription)
        })
    })
  })

  describe('updateUsersForPlan', () => {
    let getSubscriptionForOrganizationStub
    let updateUsersForPlanStub
    let subscriptionId = 'sub_23423234sdf'

    beforeEach('Stub out Stripe methods', () => {
      let subscription = {
        id: subscriptionId
      }
      getSubscriptionForOrganizationStub = sinon.stub(Stripe, '_getSubscriptionForOrganization').resolves(subscription)
      updateUsersForPlanStub = sinon.stub(Stripe, '_updateUsersForPlan').resolves(subscription)
    })

    afterEach('Restore Stripe methods', () => {
      getSubscriptionForOrganizationStub.restore()
      updateUsersForPlanStub.restore()
    })

    it('should get the subscription for an organization', () => {
      return Stripe.updateUsersForPlan(orgMock)
        .then(() => {
          sinon.assert.calledOnce(getSubscriptionForOrganizationStub)
          sinon.assert.calledWithExactly(
            getSubscriptionForOrganizationStub,
            stripeCustomerId
          )
        })
    })

    it('should update plans for for user', () => {
      return Stripe.updateUsersForPlan(orgMock)
        .then(() => {
          sinon.assert.calledOnce(updateUsersForPlanStub)
          sinon.assert.calledWithExactly(
            updateUsersForPlanStub,
            subscriptionId,
            orgMock.users
          )
        })
    })

    it('should re-throw any errors', done => {
      let thrownErr = new Error('hello')
      updateUsersForPlanStub.rejects(thrownErr)

      Stripe.updateUsersForPlan(orgMock)
        .asCallback(err => {
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('getPlanIdForOrganizationBasedOnCurrentUsage', () => {
    let getAllInstancesForUserByGithubIdStub
    let orgGithubId

    beforeEach('Stub out fetchInstances', () => {
      getAllInstancesForUserByGithubIdStub = sinon.stub(runnableClient, 'getAllInstancesForUserByGithubId').resolves([])
    })

    afterEach('Restore fetchInstances', () => {
      getAllInstancesForUserByGithubIdStub.restore()
    })

    it('should fetch the instances from API', () => {
      return Stripe.getPlanIdForOrganizationBasedOnCurrentUsage(orgGithubId)
        .then(() => {
          sinon.assert.calledOnce(getAllInstancesForUserByGithubIdStub)
          sinon.assert.calledWithExactly(
            getAllInstancesForUserByGithubIdStub,
            orgGithubId
          )
        })
    })

    it('should return `runnable-basic` if there are 0 instances', function () {
      getAllInstancesForUserByGithubIdStub.resolves([])

      return Stripe.getPlanIdForOrganizationBasedOnCurrentUsage(orgGithubId)
        .then(planId => {
          expect(planId).to.equal('runnable-basic')
        })
    })

    it('should return `runnable-basic` if there are 2 instances', function () {
      getAllInstancesForUserByGithubIdStub.resolves(new Array(2))

      return Stripe.getPlanIdForOrganizationBasedOnCurrentUsage(orgGithubId)
        .then(planId => {
          expect(planId).to.equal('runnable-basic')
        })
    })

    it('should return `runnable-standard` if there are 3 instances', function () {
      getAllInstancesForUserByGithubIdStub.resolves(new Array(3))

      return Stripe.getPlanIdForOrganizationBasedOnCurrentUsage(orgGithubId)
        .then(planId => {
          expect(planId).to.equal('runnable-standard')
        })
    })

    it('should return `runnable-standard` if there are 7 instances', function () {
      getAllInstancesForUserByGithubIdStub.resolves(new Array(7))

      return Stripe.getPlanIdForOrganizationBasedOnCurrentUsage(orgGithubId)
        .then(planId => {
          expect(planId).to.equal('runnable-standard')
        })
    })

    it('should return `runnable-plus` if there are more than 7 instances', function () {
      getAllInstancesForUserByGithubIdStub.resolves(new Array(8))

      return Stripe.getPlanIdForOrganizationBasedOnCurrentUsage(orgGithubId)
        .then(planId => {
          expect(planId).to.equal('runnable-plus')
        })
    })

    it('should return `runnable-plus` if there are a shit ton of instances', function () {
      getAllInstancesForUserByGithubIdStub.resolves(new Array(999))

      return Stripe.getPlanIdForOrganizationBasedOnCurrentUsage(orgGithubId)
        .then(planId => {
          expect(planId).to.equal('runnable-plus')
        })
    })
  })

  describe('_getSubscriptionForOrganization', () => {
    let getSubscriptionList
    let orgStripeCustomerId = 'cust_234234'
    let firstSubscription = {}

    beforeEach('stub out Stripe API calls', () => {
      let subscriptionListResponse = {
        data: [
          firstSubscription
        ]
      }
      getSubscriptionList = sinon.stub(stripeClient.subscriptions, 'list').resolves(subscriptionListResponse)
    })

    afterEach('restore Stripe API calls', () => {
      getSubscriptionList.restore()
    })

    it('should fetch a list of subscription from Stripe', () => {
      return Stripe._getSubscriptionForOrganization(orgStripeCustomerId)
        .then(res => {
          sinon.assert.calledOnce(getSubscriptionList)
          sinon.assert.calledWithExactly(
            getSubscriptionList,
            {
              limit: 1,
              customer: orgStripeCustomerId

            }
          )
        })
    })

    it('should return the first subsription from the query', () => {
      return Stripe._getSubscriptionForOrganization(orgStripeCustomerId)
        .then(res => {
          expect(res).to.equal(firstSubscription)
        })
    })

    it('should throw an EntityNotFoundError if the subscription is not found', done => {
      getSubscriptionList.resolves({ data: [] })

      Stripe._getSubscriptionForOrganization(orgStripeCustomerId)
        .asCallback(err => {
          expect(err).to.be.an.instanceof(EntityNotFoundError)
          done()
        })
    })

    it('should throw any errors', done => {
      let thrownErr = new Error('hello')
      getSubscriptionList.rejects(thrownErr)

      Stripe._getSubscriptionForOrganization(orgStripeCustomerId)
        .asCallback(err => {
          expect(err).to.equal(thrownErr)
          done()
        })
    })
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
    let users

    beforeEach('Set mock for users', () => {
      users = [
        { githubId: 6 },
        { githubId: 7 },
        { githubId: 8 },
        { githubId: 9 }
      ]
    })

    it('should return an object', () => {
      let response = Stripe._getUpdateObjectForUsers(users)
      expect(response).to.have.property('quantity')
      expect(response).to.have.deep.property('metadata.users')
    })

    it('should return the length of then users', () => {
      let response = Stripe._getUpdateObjectForUsers(users)
      expect(response).to.have.property('quantity', users.length)

      users.pop()
      response = Stripe._getUpdateObjectForUsers(users)
      expect(response).to.have.property('quantity', users.length)
    })

    it('should return a stringified json object', () => {
      let response = Stripe._getUpdateObjectForUsers(users)
      expect(response).to.have.deep.property('metadata.users')
      expect(response.metadata.users).to.be.a('string')
      let userIds = users.map(x => x.githubId)
      expect(response.metadata.users).to.equal(JSON.stringify(userIds))
    })

    it('should return a stringified json object that does not exceed 500 chars', () => {
      var oneHunderedChars = '1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890'
      users = [
        { githubId: oneHunderedChars },
        { githubId: oneHunderedChars },
        { githubId: oneHunderedChars },
        { githubId: oneHunderedChars },
        { githubId: oneHunderedChars },
        { githubId: oneHunderedChars }
      ]

      let response = Stripe._getUpdateObjectForUsers(users)
      expect(response).to.have.deep.property('metadata.users')
      expect(response.metadata.users).to.be.a('string')
      expect(response.metadata.users).to.not.equal(JSON.stringify(users))
      expect(response.metadata.users).to.have.length(499)
    })
  })

  describe('_generatePlanUsersForOrganization', () => {
    let users
    // These are set in the application logic
    let MINIMUM_NUMBER_OF_USERS_IN_PLAN = 3
    let addedUserString = 'ADDED_USER_TO_MEET_MINIMUM'

    beforeEach('Set mock for users', () => {
      users = [
        { githubId: 6 },
        { githubId: 7 },
        { githubId: 8 }
      ]
    })

    it('should return an array of github ids', () => {
      let response = Stripe._generatePlanUsersForOrganization(users)
      expect(response).to.be.an('array')
      response.every((i, item) => {
        expect(item).to.be.a('number')
      })
      expect(response).to.deep.equal([6, 7, 8])
    })

    it('should return an array with at least the minimum number of users', () => {
      users.pop() // Remove last user

      let response = Stripe._generatePlanUsersForOrganization(users)
      expect(response).to.be.an('array')
      expect(response.length).to.equal(MINIMUM_NUMBER_OF_USERS_IN_PLAN)
      expect(response).to.deep.equal([6, 7, addedUserString])
    })

    it('should return a populated array even when given an empty array', () => {
      let response = Stripe._generatePlanUsersForOrganization([])
      expect(response).to.be.an('array')
      expect(response.length).to.equal(MINIMUM_NUMBER_OF_USERS_IN_PLAN)
      expect(response).to.deep.equal([addedUserString, addedUserString, addedUserString])
    })
  })
})
