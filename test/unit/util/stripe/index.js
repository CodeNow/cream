'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
const expect = require('chai').expect
const moment = require('moment')
require('sinon-as-promised')(Promise)

const Stripe = require('util/stripe')
const StripeSubscriptionUtils = require('util/stripe/subscriptions')
const stripeClient = require('util/stripe/client')
const testUtil = require('../../../util')

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
      getPlanIdStub = sinon.stub(StripeSubscriptionUtils, 'getPlanIdForOrganizationBasedOnCurrentUsage').resolves(planId)
      createSubscriptionStub = sinon.stub(StripeSubscriptionUtils, 'createSubscription').resolves(stripeSubscription)
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

  describe('updatePaymentMethodForOrganization', () => {
    let updateCustomerStub
    let org
    let user
    const userId = 23423
    const userGithubId = 1981198
    const stripeTokenId = 'tok_18PE8zLYrJgOrBWzlTPEUiET'
    const userEmail = 'jorge@runnable.com'

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
      return Stripe.updatePaymentMethodForOrganization(org, stripeTokenId, user, userEmail)
        .then(() => {
          sinon.assert.calledOnce(updateCustomerStub)
          sinon.assert.calledWith(updateCustomerStub, stripeCustomerId, sinon.match.object)
        })
    })

    it('should update the customer with the Stripe token and the correct metadata', () => {
      return Stripe.updatePaymentMethodForOrganization(org, stripeTokenId, user, userEmail)
        .then(() => {
          sinon.assert.calledOnce(updateCustomerStub)
          sinon.assert.calledWith(updateCustomerStub, stripeCustomerId, {
            source: stripeTokenId,
            email: userEmail,
            metadata: {
              paymentMethodOwnerId: userId,
              paymentMethodOwnerGithubId: userGithubId
            }
          })
        })
    })

    it('should throw an error if the org has no `stripeCustomerId`', done => {
      delete org.stripeCustomerId

      Stripe.updatePaymentMethodForOrganization(org, stripeTokenId, user, userEmail)
        .asCallback(err => {
          expect(err).to.exist
          expect(err.message).to.match(/stripeCustomerId/i)
          done()
        })
    })

    it('should throw any errors throws by the client', done => {
      let thrownErr = new Error()
      updateCustomerStub.rejects(thrownErr)

      Stripe.updatePaymentMethodForOrganization(org, stripeTokenId, user, userEmail)
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

      Stripe.updatePaymentMethodForOrganization(org, stripeTokenId, user, userEmail)
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

      Stripe.updatePaymentMethodForOrganization(org, stripeTokenId, user, userEmail)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(ValidationError)
          expect(err.message).to.match(/stripeinvalidrequesterror/i)
          expect(err.message).to.match(/bad.*request/i)
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
              description: `${orgMock.name} ( organizationId: ${orgMock.id}, githubId: ${orgMock.githubId} )`,
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
              description: `${orgMock.name} ( organizationId: ${orgMock.id}, githubId: ${orgMock.githubId} )`,
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

  describe('#getCustomerPaymentMethodOwner', () => {
    let getCustomerStub
    let customer
    const stripeCustomerId = 'cus_23429'
    const paymentMethodOwnerId = '1' // Metadata are always strings
    const paymentMethodOwnerGithubId = '1981198' // Metadata are always strings

    beforeEach('Stub out methods', () => {
      customer = {
        metadata: {
          paymentMethodOwnerId: paymentMethodOwnerId,
          paymentMethodOwnerGithubId: paymentMethodOwnerGithubId
        }
      }
      getCustomerStub = sinon.stub(stripeClient.customers, 'retrieve').resolves(customer)
    })
    afterEach('Restore methods', () => {
      getCustomerStub.restore()
    })

    it('should get the customer', () => {
      return Stripe.getCustomerPaymentMethodOwner(stripeCustomerId)
        .then(() => {
          sinon.assert.calledOnce(getCustomerStub)
          sinon.assert.calledWith(getCustomerStub, stripeCustomerId)
        })
    })

    it('should return an object with the owner id and github id', () => {
      return Stripe.getCustomerPaymentMethodOwner(stripeCustomerId)
        .then(res => {
          expect(res.id).to.equal(parseInt(paymentMethodOwnerId, 10))
          expect(res.githubId).to.equal(parseInt(paymentMethodOwnerGithubId, 10))
        })
    })

    it('should throw an EntityNotFoundError if an id is missing', () => {
      delete customer.metadata.paymentMethodOwnerId

      return Stripe.getCustomerPaymentMethodOwner(stripeCustomerId)
        .then(testUtil.throwIfSuccess)
        .catch(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(EntityNotFoundError)
          expect(err.message).to.match(/no.*paymentMethodOwnerId.*found.*org/i)
        })
    })

    it('should throw an EntityNotFoundError if an id is missing', () => {
      delete customer.metadata.paymentMethodOwnerGithubId

      return Stripe.getCustomerPaymentMethodOwner(stripeCustomerId)
        .then(testUtil.throwIfSuccess)
        .catch(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(EntityNotFoundError)
          expect(err.message).to.match(/no.*paymentMethodOwnerGithubId.*found.*org/i)
        })
    })

    it('should throw any errors by `getCustomer`', () => {
      let thrownErr = new Error('yo')
      getCustomerStub.rejects(thrownErr)

      return Stripe.getCustomerPaymentMethodOwner(stripeCustomerId)
        .then(testUtil.throwIfSuccess)
        .catch(err => {
          expect(err).to.equal(thrownErr)
        })
    })
  })

  describe('#createNewSubscriptionForCustomerWithPaymentMethod', () => {
    let orgMock
    let users
    let getPlanIdForOrganizationBasedOnCurrentUsageStub
    let createSubscriptionStub
    let subscription = {}
    const plan = 'runnable-starter'

    beforeEach('Create mock for org', () => {
      users = []
      orgMock = {
        id: orgId,
        githubId,
        stripeCustomerId,
        users
      }
    })
    beforeEach('Stub out methods', () => {
      getPlanIdForOrganizationBasedOnCurrentUsageStub = sinon.stub(StripeSubscriptionUtils, 'getPlanIdForOrganizationBasedOnCurrentUsage').resolves(plan)
      createSubscriptionStub = sinon.stub(StripeSubscriptionUtils, 'createSubscription').resolves(subscription)
    })
    afterEach('Restore stubs', () => {
      getPlanIdForOrganizationBasedOnCurrentUsageStub.restore()
      createSubscriptionStub.restore()
    })

    it('should get the plan id', () => {
      return Stripe.createNewSubscriptionForCustomerWithPaymentMethod(orgMock)
      .then(() => {
        sinon.assert.calledOnce(getPlanIdForOrganizationBasedOnCurrentUsageStub)
        sinon.assert.calledWith(
          getPlanIdForOrganizationBasedOnCurrentUsageStub,
          githubId
        )
      })
    })

    it('should create the subscription', () => {
      return Stripe.createNewSubscriptionForCustomerWithPaymentMethod(orgMock)
      .then(() => {
        sinon.assert.calledOnce(createSubscriptionStub)
        sinon.assert.calledWith(
          createSubscriptionStub,
          stripeCustomerId,
          users,
          plan,
          { noTrial: true }
        )
      })
    })

    it('should return the new subscription', () => {
      return Stripe.createNewSubscriptionForCustomerWithPaymentMethod(orgMock)
      .then(newSubscription => {
        expect(newSubscription).to.equal(subscription)
      })
    })

    it('should throw any errors', () => {
      let thrownErr = new Error('yo')
      createSubscriptionStub.rejects(thrownErr)

      return Stripe.createNewSubscriptionForCustomerWithPaymentMethod(orgMock)
      .then(testUtil.throwIfSuccess)
      .catch(err => {
        expect(err).to.equal(thrownErr)
      })
    })
  })
})
