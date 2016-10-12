'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
const expect = require('chai').expect
require('sinon-as-promised')(Promise)

const moment = require('moment')

const runnableClient = require('util/runnable-api-client')
const StripeSubscriptionUtils = require('util/stripe/subscriptions')
const EntityNotFoundError = require('errors/entity-not-found-error')
const stripeClient = require('util/stripe/client')

describe('StripeSubscriptionUtils', function () {
  let orgMock
  const orgId = 123
  const githubId = 23423
  const stripeCustomerId = 'cus_905mQ5RdbhTUc1'

  beforeEach('Create mock for org', () => {
    orgMock = {
      id: orgId,
      githubId: githubId,
      stripeCustomerId: stripeCustomerId
    }
  })

  describe('_createSubscription', () => {
    let createSubscriptionStub
    let subscription
    let planId = 'runnable-starter'
    let generateObjectForUsersStub
    let users

    beforeEach('stub out Stripe API calls', () => {
      subscription = {}
      users = [{ githubId: 1232 }]
      createSubscriptionStub = sinon.stub(stripeClient.subscriptions, 'create').resolves(subscription)
      generateObjectForUsersStub = sinon.spy(StripeSubscriptionUtils, '_getUpdateObjectForUsers')
    })

    afterEach('restore Stripe API calls', () => {
      createSubscriptionStub.restore()
      generateObjectForUsersStub.restore()
    })

    it('should create a subscription in Stripe', () => {
      return StripeSubscriptionUtils._createSubscription(stripeCustomerId, users, planId)
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
      return StripeSubscriptionUtils._createSubscription(stripeCustomerId, users, planId)
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

      StripeSubscriptionUtils._createSubscription(stripeCustomerId, users, planId)
        .asCallback(err => {
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('get', () => {
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
      return StripeSubscriptionUtils.get(orgStripeCustomerId)
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

    it('should return the first subscription from the query', () => {
      return StripeSubscriptionUtils.get(orgStripeCustomerId)
        .then(res => {
          expect(res).to.equal(firstSubscription)
        })
    })

    it('should throw an EntityNotFoundError if the subscription is not found', done => {
      getSubscriptionList.resolves({ data: [] })

      StripeSubscriptionUtils.get(orgStripeCustomerId)
        .asCallback(err => {
          expect(err).to.be.an.instanceof(EntityNotFoundError)
          done()
        })
    })

    it('should throw any errors', done => {
      let thrownErr = new Error('hello')
      getSubscriptionList.rejects(thrownErr)

      StripeSubscriptionUtils.get(orgStripeCustomerId)
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
      return StripeSubscriptionUtils.getPlanIdForOrganizationBasedOnCurrentUsage(orgGithubId)
        .then(() => {
          sinon.assert.calledOnce(getAllInstancesForUserByGithubIdStub)
          sinon.assert.calledWithExactly(
            getAllInstancesForUserByGithubIdStub,
            orgGithubId
          )
        })
    })

    it('should return `runnable-starter` if there are 0 instances', function () {
      getAllInstancesForUserByGithubIdStub.resolves([])

      return StripeSubscriptionUtils.getPlanIdForOrganizationBasedOnCurrentUsage(orgGithubId)
        .then(planId => {
          expect(planId).to.equal('runnable-starter')
        })
    })

    it('should return `runnable-starter` if there are 2 instances', function () {
      getAllInstancesForUserByGithubIdStub.resolves(new Array(2))

      return StripeSubscriptionUtils.getPlanIdForOrganizationBasedOnCurrentUsage(orgGithubId)
        .then(planId => {
          expect(planId).to.equal('runnable-starter')
        })
    })

    it('should return `runnable-standard` if there are 3 instances', function () {
      getAllInstancesForUserByGithubIdStub.resolves(new Array(3))

      return StripeSubscriptionUtils.getPlanIdForOrganizationBasedOnCurrentUsage(orgGithubId)
        .then(planId => {
          expect(planId).to.equal('runnable-standard')
        })
    })

    it('should return `runnable-standard` if there are 7 instances', function () {
      getAllInstancesForUserByGithubIdStub.resolves(new Array(7))

      return StripeSubscriptionUtils.getPlanIdForOrganizationBasedOnCurrentUsage(orgGithubId)
        .then(planId => {
          expect(planId).to.equal('runnable-standard')
        })
    })

    it('should return `runnable-plus` if there are more than 7 instances', function () {
      getAllInstancesForUserByGithubIdStub.resolves(new Array(8))

      return StripeSubscriptionUtils.getPlanIdForOrganizationBasedOnCurrentUsage(orgGithubId)
        .then(planId => {
          expect(planId).to.equal('runnable-plus')
        })
    })

    it('should return `runnable-plus` if there are a shit ton of instances', function () {
      getAllInstancesForUserByGithubIdStub.resolves(new Array(999))

      return StripeSubscriptionUtils.getPlanIdForOrganizationBasedOnCurrentUsage(orgGithubId)
        .then(planId => {
          expect(planId).to.equal('runnable-plus')
        })
    })
  })

  describe('updatePlanIdForOrganizationBasedOnCurrentUsage', () => {
    let _getSubscriptionForOrganizationStub
    let getPlanIdForOrganizationBasedOnCurrentUsageStub
    let updateSubscriptionStub
    let planId = 'runnable-starter'
    let subscriptionId = 'sub_18i5aXLYrJgOrBWzYNR9xq87'

    beforeEach('Stub out method', () => {
      let subscription = {
        id: subscriptionId
      }
      _getSubscriptionForOrganizationStub = sinon.stub(StripeSubscriptionUtils, 'get').resolves(subscription)
      getPlanIdForOrganizationBasedOnCurrentUsageStub = sinon.stub(StripeSubscriptionUtils, 'getPlanIdForOrganizationBasedOnCurrentUsage').resolves(planId)
      updateSubscriptionStub = sinon.stub(stripeClient.subscriptions, 'update').resolves()
    })
    afterEach('Restore stub', () => {
      _getSubscriptionForOrganizationStub.restore()
      getPlanIdForOrganizationBasedOnCurrentUsageStub.restore()
      updateSubscriptionStub.restore()
    })

    it('should fetch the subscription', () => {
      return StripeSubscriptionUtils.updatePlanIdForOrganizationBasedOnCurrentUsage(orgMock)
        .then(() => {
          sinon.assert.calledOnce(_getSubscriptionForOrganizationStub)
          sinon.assert.calledWithExactly(_getSubscriptionForOrganizationStub, orgMock.stripeCustomerId)
        })
    })

    it('should fetch the plan', () => {
      return StripeSubscriptionUtils.updatePlanIdForOrganizationBasedOnCurrentUsage(orgMock)
        .then(() => {
          sinon.assert.calledOnce(getPlanIdForOrganizationBasedOnCurrentUsageStub)
          sinon.assert.calledWithExactly(getPlanIdForOrganizationBasedOnCurrentUsageStub, orgMock.githubId)
        })
    })

    it('should update the plan in the subscription', () => {
      return StripeSubscriptionUtils.updatePlanIdForOrganizationBasedOnCurrentUsage(orgMock)
        .then(() => {
          sinon.assert.calledOnce(updateSubscriptionStub)
          sinon.assert.calledWithExactly(updateSubscriptionStub, subscriptionId, { plan: planId })
        })
    })

    it('should return any errors', done => {
      let thrownErr = new Error()
      updateSubscriptionStub.rejects(thrownErr)

      StripeSubscriptionUtils.updatePlanIdForOrganizationBasedOnCurrentUsage(orgMock)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('generatePlanUsersForOrganization', () => {
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
      let response = StripeSubscriptionUtils.generatePlanUsersForOrganization(users)
      expect(response).to.be.an('array')
      response.every((i, item) => {
        expect(item).to.be.a('number')
      })
      expect(response).to.deep.equal([6, 7, 8])
    })

    it('should return an array with at least the minimum number of users', () => {
      users.pop() // Remove last user

      let response = StripeSubscriptionUtils.generatePlanUsersForOrganization(users)
      expect(response).to.be.an('array')
      expect(response.length).to.equal(MINIMUM_NUMBER_OF_USERS_IN_PLAN)
      expect(response).to.deep.equal([6, 7, addedUserString])
    })

    it('should return a populated array even when given an empty array', () => {
      let response = StripeSubscriptionUtils.generatePlanUsersForOrganization([])
      expect(response).to.be.an('array')
      expect(response.length).to.equal(MINIMUM_NUMBER_OF_USERS_IN_PLAN)
      expect(response).to.deep.equal([addedUserString, addedUserString, addedUserString])
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
      getSubscriptionForOrganizationStub = sinon.stub(StripeSubscriptionUtils, 'get').resolves(subscription)
      updateUsersForPlanStub = sinon.stub(StripeSubscriptionUtils, '_updateUsersForPlan').resolves(subscription)
    })

    afterEach('Restore Stripe methods', () => {
      getSubscriptionForOrganizationStub.restore()
      updateUsersForPlanStub.restore()
    })

    it('should get the subscription for an organization', () => {
      return StripeSubscriptionUtils.updateUsersForPlan(orgMock)
        .then(() => {
          sinon.assert.calledOnce(getSubscriptionForOrganizationStub)
          sinon.assert.calledWithExactly(
            getSubscriptionForOrganizationStub,
            stripeCustomerId
          )
        })
    })

    it('should update plans for for user', () => {
      return StripeSubscriptionUtils.updateUsersForPlan(orgMock)
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

      StripeSubscriptionUtils.updateUsersForPlan(orgMock)
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
      return StripeSubscriptionUtils._updateUsersForPlan(subscriptionId, users)
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

      StripeSubscriptionUtils._updateUsersForPlan(subscriptionId, users)
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
      let response = StripeSubscriptionUtils._getUpdateObjectForUsers(users)
      expect(response).to.have.property('quantity')
      expect(response).to.have.deep.property('metadata.users')
    })

    it('should return the length of then users', () => {
      let response = StripeSubscriptionUtils._getUpdateObjectForUsers(users)
      expect(response).to.have.property('quantity', users.length)

      users.pop()
      response = StripeSubscriptionUtils._getUpdateObjectForUsers(users)
      expect(response).to.have.property('quantity', users.length)
    })

    it('should return a stringified json object', () => {
      let response = StripeSubscriptionUtils._getUpdateObjectForUsers(users)
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

      let response = StripeSubscriptionUtils._getUpdateObjectForUsers(users)
      expect(response).to.have.deep.property('metadata.users')
      expect(response.metadata.users).to.be.a('string')
      expect(response.metadata.users).to.not.equal(JSON.stringify(users))
      expect(response.metadata.users).to.have.length(499)
    })
  })

  describe('#updateSubscriptionWithTrialEndedNotification', () => {
    let updateSubscriptionStub
    const subscription = {}
    const subscriptionId = 'sub_234243423k'
    const notificationSentTime = moment().toISOString()

    beforeEach('Stub out method', () => {
      updateSubscriptionStub = sinon.stub(stripeClient.subscriptions, 'update').resolves(subscription)
    })

    afterEach('Restore stub', () => {
      updateSubscriptionStub.restore()
    })

    it('should call `update`', () => {
      StripeSubscriptionUtils.updateSubscriptionWithTrialEndedNotification(subscriptionId, notificationSentTime)
        .then(subscription => {
          sinon.assert.calledOnce(updateSubscriptionStub)
          sinon.assert.calledWithExactly(
            updateSubscriptionStub,
            subscriptionId,
            {
              metadata: {
                notifiedTrialEnded: notificationSentTime
              }
            }
          )
        })
    })

    it('should return the updated subscription', () => {
      StripeSubscriptionUtils.updateSubscriptionWithTrialEndedNotification(subscriptionId, notificationSentTime)
        .then(subscription => {
          expect(subscription).to.equal(subscription)
        })
    })

    it('should throw any errors throws by the client', () => {
      let thrownErr = new Error()
      updateSubscriptionStub.rejects(thrownErr)

      StripeSubscriptionUtils.updateSubscriptionWithTrialEndedNotification(subscriptionId, notificationSentTime)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
        })
    })
  })

  describe('#updateSubscriptionWithTrialEndingNotification', () => {
    let updateSubscriptionStub
    const subscription = {}
    const subscriptionId = 'sub_234243423k'
    const notificationSentTime = moment().toISOString()

    beforeEach('Stub out method', () => {
      updateSubscriptionStub = sinon.stub(stripeClient.subscriptions, 'update').resolves(subscription)
    })

    afterEach('Restore stub', () => {
      updateSubscriptionStub.restore()
    })

    it('should call `update`', () => {
      StripeSubscriptionUtils.updateSubscriptionWithTrialEndingNotification(subscriptionId, notificationSentTime)
        .then(subscription => {
          sinon.assert.calledOnce(updateSubscriptionStub)
          sinon.assert.calledWithExactly(
            updateSubscriptionStub,
            subscriptionId,
            {
              metadata: {
                notifiedTrialEnding: notificationSentTime
              }
            }
          )
        })
    })

    it('should return the updated subscription', () => {
      StripeSubscriptionUtils.updateSubscriptionWithTrialEndingNotification(subscriptionId, notificationSentTime)
        .then(subscription => {
          expect(subscription).to.equal(subscription)
        })
    })

    it('should throw any errors throws by the client', () => {
      let thrownErr = new Error()
      updateSubscriptionStub.rejects(thrownErr)

      StripeSubscriptionUtils.updateSubscriptionWithTrialEndingNotification(subscriptionId, notificationSentTime)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
        })
    })
  })
})