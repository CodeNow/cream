'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
const expect = require('chai').expect
require('sinon-as-promised')(Promise)

const moment = require('moment')

const runnableClient = require('util/runnable-api-client')
const StripeSubscriptionUtils = require('util/stripe/subscriptions')
const ValidationError = require('errors/validation-error')
const stripeClient = require('util/stripe/client')

describe('StripeSubscriptionUtils', function () {
  let orgMock
  const orgId = 123
  const githubId = 23423
  const stripeCustomerId = 'cus_905mQ5RdbhTUc1'
  const stripeSubscriptionId = 'sub_23492382378'

  beforeEach('Create mock for org', () => {
    orgMock = {
      id: orgId,
      githubId: githubId,
      stripeCustomerId: stripeCustomerId,
      stripeSubscriptionId: stripeSubscriptionId
    }
  })

  describe('createSubscription', () => {
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
      return StripeSubscriptionUtils.createSubscription(stripeCustomerId, users, planId)
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

    it('should create a subscription with no trial if `noTrial` is passed', () => {
      return StripeSubscriptionUtils.createSubscription(stripeCustomerId, users, planId, true)
        .then(res => {
          expect(res).to.equal(subscription)
          sinon.assert.calledOnce(createSubscriptionStub)
          sinon.assert.calledWithExactly(
            createSubscriptionStub,
            {
              customer: stripeCustomerId,
              plan: planId,
              trial_end: 'now',
              quantity: sinon.match.number,
              metadata: sinon.match.object
            }
          )
        })
    })

    it('should call `_getUpdateObjectForUsers`', () => {
      return StripeSubscriptionUtils.createSubscription(stripeCustomerId, users, planId)
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

      StripeSubscriptionUtils.createSubscription(stripeCustomerId, users, planId)
        .asCallback(err => {
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('get', () => {
    let getSubscriptionList
    let orgStripeSubscriptionId = 'sub_234923'
    let firstSubscription = {}

    beforeEach('stub out Stripe API calls', () => {
      getSubscriptionList = sinon.stub(stripeClient.subscriptions, 'retrieve').resolves(firstSubscription)
    })

    afterEach('restore Stripe API calls', () => {
      getSubscriptionList.restore()
    })

    it('should throw a ValidationError an invalid subscription id is passed', done => {
      StripeSubscriptionUtils.get('cus_20394232') // Customer ID
        .asCallback(err => {
          expect(err).to.be.an.instanceof(ValidationError)
          done()
        })
    })

    it('should fetch the subscription', () => {
      return StripeSubscriptionUtils.get(orgStripeSubscriptionId)
        .then(res => {
          sinon.assert.calledOnce(getSubscriptionList)
          sinon.assert.calledWithExactly(
            getSubscriptionList,
            orgStripeSubscriptionId
          )
        })
    })

    it('should return the subscription', () => {
      return StripeSubscriptionUtils.get(orgStripeSubscriptionId)
        .then(res => {
          expect(res).to.equal(firstSubscription)
        })
    })

    it('should throw a ValidationError if the subscription is not found', done => {
      let originalErr = new Error('No subscription found')
      originalErr.type = 'StripeInvalidRequestError'
      getSubscriptionList.rejects(originalErr)

      StripeSubscriptionUtils.get(orgStripeSubscriptionId)
        .asCallback(err => {
          expect(err).to.be.an.instanceof(ValidationError)
          done()
        })
    })

    it('should throw any errors', done => {
      let thrownErr = new Error('hello')
      getSubscriptionList.rejects(thrownErr)

      StripeSubscriptionUtils.get(orgStripeSubscriptionId)
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

  describe('#updatePlanIdForOrganizationBasedOnCurrentUsage', () => {
    let getPlanIdForOrganizationBasedOnCurrentUsageStub
    let updateSubscriptionStub
    let planId = 'runnable-starter'

    beforeEach('Stub out method', () => {
      getPlanIdForOrganizationBasedOnCurrentUsageStub = sinon.stub(StripeSubscriptionUtils, 'getPlanIdForOrganizationBasedOnCurrentUsage').resolves(planId)
      updateSubscriptionStub = sinon.stub(stripeClient.subscriptions, 'update').resolves()
    })
    afterEach('Restore stub', () => {
      getPlanIdForOrganizationBasedOnCurrentUsageStub.restore()
      updateSubscriptionStub.restore()
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
          sinon.assert.calledWithExactly(updateSubscriptionStub, stripeSubscriptionId, { plan: planId })
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

  describe('#updateUsersForPlan', () => {
    let updateCustomerStub
    let customer
    let subscriptionId = 23423
    let users
    let org

    beforeEach('stub out Stripe API calls', () => {
      customer = {}
      users = [{ githubId: 1232 }]
      org = {
        stripeSubscriptionId: subscriptionId,
        users
      }
      updateCustomerStub = sinon.stub(stripeClient.subscriptions, 'update').resolves(customer)
    })

    afterEach('restore Stripe API calls', () => {
      updateCustomerStub.restore()
    })

    it('should update the customer in Stripe', () => {
      return StripeSubscriptionUtils.updateUsersForPlan(org)
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

    it('should throw a ValidationError if there is no subscription id', done => {
      let thrownErr = new Error('No subscription found')
      thrownErr.type = 'StripeInvalidRequestError'
      updateCustomerStub.rejects(thrownErr)

      StripeSubscriptionUtils.updateUsersForPlan(org)
        .asCallback(err => {
          expect(err).to.be.an.instanceof(ValidationError)
          done()
        })
    })

    it('should throw any other errors', done => {
      let thrownErr = new Error('hello')
      updateCustomerStub.rejects(thrownErr)

      StripeSubscriptionUtils.updateUsersForPlan(org)
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

  describe('#updateWithTrialEndedNotification', () => {
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
      StripeSubscriptionUtils.updateWithTrialEndedNotification(subscriptionId, notificationSentTime)
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
      StripeSubscriptionUtils.updateWithTrialEndedNotification(subscriptionId, notificationSentTime)
        .then(subscription => {
          expect(subscription).to.equal(subscription)
        })
    })

    it('should throw any errors throws by the client', () => {
      let thrownErr = new Error()
      updateSubscriptionStub.rejects(thrownErr)

      StripeSubscriptionUtils.updateWithTrialEndedNotification(subscriptionId, notificationSentTime)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
        })
    })
  })

  describe('#updateWithTrialEndingNotification', () => {
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
      StripeSubscriptionUtils.updateWithTrialEndingNotification(subscriptionId, notificationSentTime)
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
      StripeSubscriptionUtils.updateWithTrialEndingNotification(subscriptionId, notificationSentTime)
        .then(subscription => {
          expect(subscription).to.equal(subscription)
        })
    })

    it('should throw any errors throws by the client', () => {
      let thrownErr = new Error()
      updateSubscriptionStub.rejects(thrownErr)

      StripeSubscriptionUtils.updateWithTrialEndingNotification(subscriptionId, notificationSentTime)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
        })
    })
  })
})
