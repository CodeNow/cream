'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
const expect = require('chai').expect
const moment = require('moment')
require('sinon-as-promised')(Promise)

const runnableClient = require('util/runnable-api-client')
const Stripe = require('util/stripe')
const stripeClient = Stripe.stripeClient

const DiscountService = require('services/discount-service')
const EntityExistsInStripeError = require('errors/entity-exists-error')
const EntityNotFoundError = require('errors/entity-not-found-error')
const StripeError = require('errors/stripe-error')
const ValidationError = require('errors/validation-error')

describe('Stripe', function () {
  let orgMock
  let orgId = 123
  let githubId = 23423
  let stripeCustomerId = 'cus_905mQ5RdbhTUc1'

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
    let planId = 'runnable-starter'
    let stripeSubscription
    let stripeCustomer

    beforeEach('Create mock for org', () => {
      users = []
      orgMockNotInStripe = {
        id: orgId, githubId: githubId,
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
      getSubscriptionForOrganizationStub = sinon.stub(Stripe, 'getSubscriptionForOrganization').resolves(subscription)
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

  describe('updatePlanIdForOrganizationBasedOnCurrentUsage', () => {
    let _getSubscriptionForOrganizationStub
    let getPlanIdForOrganizationBasedOnCurrentUsageStub
    let updateSubsriptionStub
    let planId = 'runnable-starter'
    let subscriptionId = 'sub_18i5aXLYrJgOrBWzYNR9xq87'

    beforeEach('Stub out method', () => {
      let subscription = {
        id: subscriptionId
      }
      _getSubscriptionForOrganizationStub = sinon.stub(Stripe, 'getSubscriptionForOrganization').resolves(subscription)
      getPlanIdForOrganizationBasedOnCurrentUsageStub = sinon.stub(Stripe, 'getPlanIdForOrganizationBasedOnCurrentUsage').resolves(planId)
      updateSubsriptionStub = sinon.stub(stripeClient.subscriptions, 'update').resolves()
    })
    afterEach('Restore stub', () => {
      _getSubscriptionForOrganizationStub.restore()
      getPlanIdForOrganizationBasedOnCurrentUsageStub.restore()
      updateSubsriptionStub.restore()
    })

    it('should fetch the subscription', () => {
      return Stripe.updatePlanIdForOrganizationBasedOnCurrentUsage(orgMock)
        .then(() => {
          sinon.assert.calledOnce(_getSubscriptionForOrganizationStub)
          sinon.assert.calledWithExactly(_getSubscriptionForOrganizationStub, orgMock.stripeCustomerId)
        })
    })

    it('should fetch the plan', () => {
      return Stripe.updatePlanIdForOrganizationBasedOnCurrentUsage(orgMock)
        .then(() => {
          sinon.assert.calledOnce(getPlanIdForOrganizationBasedOnCurrentUsageStub)
          sinon.assert.calledWithExactly(getPlanIdForOrganizationBasedOnCurrentUsageStub, orgMock.githubId)
        })
    })

    it('should update the plan in the subscription', () => {
      return Stripe.updatePlanIdForOrganizationBasedOnCurrentUsage(orgMock)
        .then(() => {
          sinon.assert.calledOnce(updateSubsriptionStub)
          sinon.assert.calledWithExactly(updateSubsriptionStub, subscriptionId, { plan: planId })
        })
    })

    it('should return any errors', done => {
      let thrownErr = new Error()
      updateSubsriptionStub.rejects(thrownErr)

      Stripe.updatePlanIdForOrganizationBasedOnCurrentUsage(orgMock)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('updatePaymentMethodForOrganization', () => {
    let updateCustomerStub
    let org
    let user
    let userId = 23423
    let userGithubId = 1981198
    let stripeTokenId = 'tok_18PE8zLYrJgOrBWzlTPEUiET'

    beforeEach('Create mocks', () => {
      org = {
        stripeCustomerId: stripeCustomerId
      }
      user = {
        id: userId,
        githubId: userGithubId
      }
    })

    beforeEach('Stub out method', () => {
      updateCustomerStub = sinon.stub(stripeClient.customers, 'update').resolves()
    })
    afterEach('Restore stub', () => {
      updateCustomerStub.restore()
    })

    it('should update the customer', () => {
      return Stripe.updatePaymentMethodForOrganization(org, stripeTokenId, user)
        .then(() => {
          sinon.assert.calledOnce(updateCustomerStub)
          sinon.assert.calledWith(updateCustomerStub, stripeCustomerId, sinon.match.object)
        })
    })

    it('should update the customer with the Stripe token and the correct metadata', () => {
      return Stripe.updatePaymentMethodForOrganization(org, stripeTokenId, user)
        .then(() => {
          sinon.assert.calledOnce(updateCustomerStub)
          sinon.assert.calledWith(updateCustomerStub, stripeCustomerId, {
            source: stripeTokenId,
            metadata: {
              paymentMethodOwnerId: userId,
              paymentMethodOwnerGithubId: userGithubId
            }
          })
        })
    })

    it('should throw an error if the org has no `stripeCustomerId`', done => {
      delete org.stripeCustomerId

      Stripe.updatePaymentMethodForOrganization(org, stripeTokenId, user)
        .asCallback(err => {
          expect(err).to.exist
          expect(err.message).to.match(/stripeCustomerId/i)
          done()
        })
    })

    it('should throw any errors throws by the client', done => {
      let thrownErr = new Error()
      updateCustomerStub.rejects(thrownErr)

      Stripe.updatePaymentMethodForOrganization(org, stripeTokenId, user)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
          done()
        })
    })

    it('should throw a `ValidationError` if there was a `StripeCardError`', done => {
      let thrownError = new Error('bad card')
      thrownError.type = 'StripeCardError'
      updateCustomerStub.rejects(thrownError)

      Stripe.updatePaymentMethodForOrganization(org, stripeTokenId, user)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(ValidationError)
          expect(err.message).to.match(/stripecarderror/i)
          expect(err.message).to.match(/bad.*card/i)
          done()
        })
    })

    it('should throw a `ValidationError` if there was a `StripeInvalidRequestError`', done => {
      let thrownError = new Error('bad request')
      thrownError.type = 'StripeInvalidRequestError'
      updateCustomerStub.rejects(thrownError)

      Stripe.updatePaymentMethodForOrganization(org, stripeTokenId, user)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(ValidationError)
          expect(err.message).to.match(/stripeinvalidrequesterror/i)
          expect(err.message).to.match(/bad.*request/i)
          done()
        })
    })
  })

  describe('updateInvoiceWithPaymentMethodOwner', () => {
    let invoiceId = 'in_18i5aXLYrJgOrBWzYNR9xq87'
    let customer
    let retrieveCustomerStub
    let _updateInvoiceMetadataStub

    beforeEach('Stub out method', () => {
      customer = {}
      retrieveCustomerStub = sinon.stub(stripeClient.customers, 'retrieve').resolves(customer)
      _updateInvoiceMetadataStub = sinon.stub(Stripe, '_updateInvoiceMetadata').resolves()
    })

    afterEach('Restore stub', () => {
      retrieveCustomerStub.restore()
      _updateInvoiceMetadataStub.restore()
    })

    it('should retrieve the customer', () => {
      return Stripe.updateInvoiceWithPaymentMethodOwner(orgMock, invoiceId)
        .then(() => {
          sinon.assert.calledOnce(retrieveCustomerStub)
          sinon.assert.calledWithExactly(
            retrieveCustomerStub,
            stripeCustomerId
          )
        })
    })

    it('should update the invoice metadata', () => {
      return Stripe.updateInvoiceWithPaymentMethodOwner(orgMock, invoiceId)
        .then(() => {
          sinon.assert.calledOnce(_updateInvoiceMetadataStub)
          sinon.assert.calledWithExactly(
            _updateInvoiceMetadataStub,
            invoiceId,
            customer
          )
        })
    })

    it('should throw any errors throws by the client', done => {
      let thrownErr = new Error()
      _updateInvoiceMetadataStub.rejects(thrownErr)

      Stripe.updateInvoiceWithPaymentMethodOwner(orgMock, invoiceId)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('_updateInvoiceMetadata', () => {
    let updateInvoiceStub
    let invoiceId = 'in_18i5aXLYrJgOrBWzYNR9xq87'
    let customer
    let userId = 23423
    let userGithubId = 198198

    beforeEach('Stub out method', () => {
      customer = {
        metadata: {
          paymentMethodOwnerId: userId,
          paymentMethodOwnerGithubId: userGithubId
        }
      }
      updateInvoiceStub = sinon.stub(stripeClient.invoices, 'update').resolves()
    })

    afterEach('Restore stub', () => {
      updateInvoiceStub.restore()
    })

    it('should update the invoice with the corrrect metadata', () => {
      return Stripe._updateInvoiceMetadata(invoiceId, customer)
        .then(() => {
          sinon.assert.calledOnce(updateInvoiceStub)
          sinon.assert.calledWithExactly(
            updateInvoiceStub,
            invoiceId,
            {
              metadata: {
                paymentMethodOwnerId: userId,
                paymentMethodOwnerGithubId: userGithubId
              }
            }
          )
        })
    })

    it('should throw any errors throws by the client', done => {
      let thrownErr = new Error()
      updateInvoiceStub.rejects(thrownErr)

      Stripe._updateInvoiceMetadata(invoiceId, customer)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('getCustomer', () => {
    let getCustomerStub
    let customer = {}
    let stripeCustomerId = 'cus_23429'

    beforeEach('Stub out methods', () => {
      getCustomerStub = sinon.stub(stripeClient.customers, 'retrieve').resolves(customer)
    })
    afterEach('Restore methods', () => {
      getCustomerStub.restore()
    })

    it('should throw an error if no `stripeCustomerId` is passed', done => {
      Stripe.getCustomer(null)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceOf(EntityNotFoundError)
          expect(err.message).to.match(/stripeCustomerId/i)
          done()
        })
    })

    it('should retrive the customer', () => {
      return Stripe.getCustomer(stripeCustomerId)
        .then(res => {
          sinon.assert.calledOnce(getCustomerStub)
          sinon.assert.calledWithExactly(getCustomerStub, stripeCustomerId)
          expect(res).to.equal(customer)
        })
    })

    it('should throw any other errors', done => {
      let thrownErr = new Error()
      getCustomerStub.rejects(thrownErr)

      Stripe.getCustomer(stripeCustomerId)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).equal(thrownErr)
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

    it('should return `runnable-starter` if there are 0 instances', function () {
      getAllInstancesForUserByGithubIdStub.resolves([])

      return Stripe.getPlanIdForOrganizationBasedOnCurrentUsage(orgGithubId)
        .then(planId => {
          expect(planId).to.equal('runnable-starter')
        })
    })

    it('should return `runnable-starter` if there are 2 instances', function () {
      getAllInstancesForUserByGithubIdStub.resolves(new Array(2))

      return Stripe.getPlanIdForOrganizationBasedOnCurrentUsage(orgGithubId)
        .then(planId => {
          expect(planId).to.equal('runnable-starter')
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

  describe('getSubscriptionForOrganization', () => {
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
      return Stripe.getSubscriptionForOrganization(orgStripeCustomerId)
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
      return Stripe.getSubscriptionForOrganization(orgStripeCustomerId)
        .then(res => {
          expect(res).to.equal(firstSubscription)
        })
    })

    it('should throw an EntityNotFoundError if the subscription is not found', done => {
      getSubscriptionList.resolves({ data: [] })

      Stripe.getSubscriptionForOrganization(orgStripeCustomerId)
        .asCallback(err => {
          expect(err).to.be.an.instanceof(EntityNotFoundError)
          done()
        })
    })

    it('should throw any errors', done => {
      let thrownErr = new Error('hello')
      getSubscriptionList.rejects(thrownErr)

      Stripe.getSubscriptionForOrganization(orgStripeCustomerId)
        .asCallback(err => {
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('_createCustomer', () => {
    let createCustomerStub
    let customer
    let getCouponAtSignUpTimeStub

    beforeEach('stub out Stripe API calls', () => {
      customer = { id: 'cus_2342323' }
      createCustomerStub = sinon.stub(stripeClient.customers, 'create').resolves(customer)
      getCouponAtSignUpTimeStub = sinon.stub(DiscountService, 'getCouponAtSignUpTime').returns(null)
    })

    afterEach('restore Stripe API calls', () => {
      createCustomerStub.restore()
      getCouponAtSignUpTimeStub.restore()
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

    it('should add a coupon if one is addded', () => {
      const couponName = 'Beta'
      getCouponAtSignUpTimeStub.returns(couponName)

      return Stripe._createCustomer(orgMock)
        .then(res => {
          expect(res).to.equal(customer)
          sinon.assert.calledWithExactly(
            createCustomerStub,
            {
              description: `Customer for organizationId: ${orgMock.id} / githubId: ${orgMock.githubId}`,
              coupon: couponName,
              metadata: {
                organizationId: orgMock.id,
                githubId: orgMock.githubId
              }
            }
          )
        })
    })

    it('should throw a StripeError if no Stripe customer is returned', done => {
      createCustomerStub.resolves(null)

      Stripe._createCustomer(orgMock)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(StripeError)
          done()
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
    let planId = 'runnable-starter'
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
      let response = Stripe.generatePlanUsersForOrganization(users)
      expect(response).to.be.an('array')
      response.every((i, item) => {
        expect(item).to.be.a('number')
      })
      expect(response).to.deep.equal([6, 7, 8])
    })

    it('should return an array with at least the minimum number of users', () => {
      users.pop() // Remove last user

      let response = Stripe.generatePlanUsersForOrganization(users)
      expect(response).to.be.an('array')
      expect(response.length).to.equal(MINIMUM_NUMBER_OF_USERS_IN_PLAN)
      expect(response).to.deep.equal([6, 7, addedUserString])
    })

    it('should return a populated array even when given an empty array', () => {
      let response = Stripe.generatePlanUsersForOrganization([])
      expect(response).to.be.an('array')
      expect(response.length).to.equal(MINIMUM_NUMBER_OF_USERS_IN_PLAN)
      expect(response).to.deep.equal([addedUserString, addedUserString, addedUserString])
    })
  })

  describe('getEvent', () => {
    let getEventStub
    let eventId = 'evt_18i5aXLYrJgOrBWzYNR9xq87'
    let stripeEvent = {}

    beforeEach('Stub out method', () => {
      getEventStub = sinon.stub(stripeClient.events, 'retrieve').resolves(stripeEvent)
    })

    afterEach('Restore stub', () => {
      getEventStub.restore()
    })

    it('should return the retrieved event', () => {
      Stripe.getEvent(eventId)
        .then(e => {
          expect(e).to.equal(stripeEvent)
          sinon.assert.calledOnce(getEventStub)
          sinon.assert.calledWithExactly(
            getEventStub,
            eventId
          )
        })
    })

    it('should throw any errors throws by the client', done => {
      let thrownErr = new Error()
      getEventStub.rejects(thrownErr)

      Stripe.getEvent(eventId)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('getInvoicesForOrg', () => {
    let getInvoicesStub
    let invoices = []

    beforeEach('Stub out method', () => {
      getInvoicesStub = sinon.stub(stripeClient.invoices, 'list').resolves(invoices)
    })

    afterEach('Restore stub', () => {
      getInvoicesStub.restore()
    })

    it('should return the retrieved event', () => {
      return Stripe.getInvoicesForOrg(stripeCustomerId)
        .then(r => {
          expect(r).to.equal(invoices)
          sinon.assert.calledOnce(getInvoicesStub)
          sinon.assert.calledWithExactly(
            getInvoicesStub,
            { customer: stripeCustomerId, limit: 100 }
          )
        })
    })

    it('should throw an error if no `stripeCustomerId` is passed', done => {
      Stripe.getInvoicesForOrg(null)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceOf(EntityNotFoundError)
          expect(err.message).to.match(/stripeCustomerId/i)
          done()
        })
    })

    it('should throw any errors throws by the client', done => {
      let thrownErr = new Error()
      getInvoicesStub.rejects(thrownErr)

      Stripe.getInvoicesForOrg(stripeCustomerId)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('getPlan', () => {
    let getPlanStub
    let plan
    let planId = 'runnable-standard'
    let amount = 900

    beforeEach('Stub out method', () => {
      plan = {
        id: planId,
        amount: amount
      }
      getPlanStub = sinon.stub(stripeClient.plans, 'retrieve').resolves(plan)
    })

    afterEach('Restore stub', () => {
      getPlanStub.restore()
    })

    it('should return the retrieved plan', () => {
      Stripe.getPlan(planId)
        .then(plan => {
          expect(plan).to.be.an('object')
          expect(plan.id).to.equal(planId)
          expect(plan.price).to.equal(amount)
          expect(plan.maxConfigurations).to.equal(7)

          sinon.assert.calledOnce(getPlanStub)
          sinon.assert.calledWithExactly(
            getPlanStub,
            planId
          )
        })
    })

    it('should throw any errors throws by the client', () => {
      let thrownErr = new Error()
      getPlanStub.rejects(thrownErr)

      Stripe.getPlan(planId)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
        })
    })
  })

  describe('getDiscount', () => {
    let getCustomerStub
    const metadata = { hello: 'world', object: JSON.stringify({ wow: '23423' }) }
    const discountStart = moment()
    const discountEnd = moment()
    const discount = {
      start: discountStart.format('X'),
      end: discountEnd.format('X'),
      coupon: {
        amount_off: null,
        percent_off: 50,
        duration: 'repeating',
        duration_in_months: 6,
        valid: true,
        metadata: metadata
      }
    }
    let customer
    let stripeCustomerId = 'cus_23429'

    beforeEach('Stub out methods', () => {
      customer = { discount: discount }
      getCustomerStub = sinon.stub(Stripe, 'getCustomer').resolves(customer)
    })
    afterEach('Restore methods', () => {
      getCustomerStub.restore()
    })

    it('should retrive the discount', () => {
      return Stripe.getDiscount(stripeCustomerId)
        .then(res => {
          sinon.assert.calledOnce(getCustomerStub)
          sinon.assert.calledWithExactly(getCustomerStub, stripeCustomerId)
        })
    })

    it('should return `null` if there is not discount', () => {
      customer.discount = null
      return Stripe.getDiscount(stripeCustomerId)
        .then(res => {
          expect(res).to.equal(null)
        })
    })

    it('should return an newly formatted object', () => {
      return Stripe.getDiscount(stripeCustomerId)
        .then(res => {
          let returnIsoString = (m) => {
            let newMoment = moment(m.format('X'), 'X')
            return newMoment.toISOString()
          }

          expect(res.start).to.equal(returnIsoString(discountStart))
          expect(res.end).to.equal(returnIsoString(discountEnd))
          expect(res.coupon.amountOff).to.equal(discount.coupon.amount_off)
          expect(res.coupon.percentOff).to.equal(discount.coupon.percent_off)
          expect(res.coupon.duration).to.equal(discount.coupon.duration)
          expect(res.coupon.durationInMonths).to.equal(discount.coupon.duration_in_months)
          expect(res.coupon.valid).to.equal(discount.coupon.valid)
          expect(res.coupon.metadata).to.be.an('object')
          expect(res.coupon.metadata.hello).to.equal('world')
        })
    })

    it('should throw any other errors', done => {
      let thrownErr = new Error()
      getCustomerStub.rejects(thrownErr)

      Stripe.getDiscount(stripeCustomerId)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).equal(thrownErr)
          done()
        })
    })
  })
})
