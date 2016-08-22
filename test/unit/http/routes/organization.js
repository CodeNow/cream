'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)
const expect = require('chai').expect

const express = require('express')
const moment = require('moment')

const OrganizationWithStripeCustomerIdFixture = require('../../../fixtures/big-poppa/organization-with-stripe-customer-id')
const InvoiceFixture = require('../../../fixtures/stripe/invoice')

const stripe = require('util/stripe')
const bigPoppa = require('util/big-poppa')

const OrganizationRouter = require('http/routes/organization')
const UserNotPartOfOrganizationError = require('errors/validation-error')

describe('HTTP /organization', () => {
  let responseStub

  beforeEach(() => {
    responseStub = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis()
    }
  })

  describe('#router', () => {
    it('should return an express router', () => {
      let router = OrganizationRouter.router()
      expect(router).to.be.an.instanceOf(express.Router().constructor)
    })
  })

  describe('#getInvoices', () => {
    let requestStub
    let getOrganizationStub
    let getInvoicesStub
    let org = Object.assign({}, OrganizationWithStripeCustomerIdFixture)
    let orgId = org.id
    let stripeCustomerId = org.stripeCustomerId
    let invoice = Object.assign({}, InvoiceFixture)
    let userId = +(invoice.metadata.paymentMethodOwnerId)
    let userGithubId = +(invoice.metadata.paymentMethodOwnerGithubId)
    let periodEnd = moment(invoice.period_end, 'X')

    beforeEach(() => {
      requestStub = { params: { id: orgId } }
      org = { stripeCustomerId: stripeCustomerId }
      getOrganizationStub = sinon.stub(bigPoppa, 'getOrganization').resolves(org)
      getInvoicesStub = sinon.stub(stripe, 'getInvoicesForOrg').resolves({ data: [invoice] })
    })
    afterEach('Restore stubs', () => {
      getOrganizationStub.restore()
      getInvoicesStub.restore()
    })

    it('should get the organization', () => {
      return OrganizationRouter.getInvoices(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(getOrganizationStub)
          sinon.assert.calledWithExactly(getOrganizationStub, orgId)
        })
    })

    it('should get the invoices from Stripe', () => {
      return OrganizationRouter.getInvoices(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(getInvoicesStub)
          sinon.assert.calledWithExactly(getInvoicesStub, stripeCustomerId)
        })
    })

    it('should return an array of invoices with the necesary propreties', () => {
      return OrganizationRouter.getInvoices(requestStub, responseStub)
        .then(() => {
          let body = responseStub.json.firstCall.args[0]
          expect(body).to.have.property('invoices')
          expect(body.invoices).to.be.an('array')
          expect(body.invoices).to.have.lengthOf(1)
          let resInvoice = body.invoices[0]
          expect(resInvoice).to.be.an('object')
          expect(resInvoice.total).to.equal(invoice.total)
          expect(resInvoice.periodEnd).to.equal(periodEnd.toISOString())
          expect(resInvoice.paidBy).to.be.an('object')
          expect(resInvoice.paidBy.id).to.equal(userId)
          expect(resInvoice.paidBy.githubId).to.equal(userGithubId)
        })
    })

    it('should not return any potentially sensitive properties', () => {
      return OrganizationRouter.getInvoices(requestStub, responseStub)
        .then(() => {
          let body = responseStub.json.firstCall.args[0]
          let resInvoice = body.invoices[0]
          expect(resInvoice).to.be.an('object')
          expect(resInvoice).to.not.have.property('id')
          expect(resInvoice).to.not.have.property('object')
          expect(resInvoice).to.not.have.property('customer')
          expect(resInvoice).to.not.have.property('charge')
          expect(resInvoice).to.not.have.property('subscription')
        })
    })

    it('should return an empty array if no `response.data` is defined', () => {
      getInvoicesStub.resolves({})

      return OrganizationRouter.getInvoices(requestStub, responseStub)
        .then(() => {
          let body = responseStub.json.firstCall.args[0]
          expect(body).to.have.property('invoices')
          expect(body.invoices).to.be.an('array')
          expect(body.invoices).to.have.lengthOf(0)
        })
    })

    it('should call `status` and `json`', () => {
      return OrganizationRouter.getInvoices(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 200)
          sinon.assert.calledOnce(responseStub.json)
        })
    })
  })

  describe('#getPlan', () => {
    let requestStub
    let getOrganizationStub
    let getSubscriptionForOrganizationStub
    let getPlanIdForOrganizationBasedOnCurrentUsageStub
    let org = Object.assign({}, OrganizationWithStripeCustomerIdFixture)
    let orgId = org.id
    let orgGithubId = org.githubId
    let orgStripeCustomerId = org.stripeCustomerId
    let getPlanStub
    let getDiscountStub
    let subscription
    let planId = 'runnable-standard'
    let subscriptionPlanId = 'runnable-plus'
    let currentStripePlan
    let nextStripePlan
    let users

    beforeEach(() => {
      users = ['678', '909', '23423', '234234']
      subscription = {
        plan: {
          id: subscriptionPlanId
        },
        metadata: {
          users: JSON.stringify(users)
        }
      }
      currentStripePlan = {
        id: subscriptionPlanId,
        price: 2900,
        maxConfigurations: 7
      }
      nextStripePlan = {
        id: planId,
        price: 4900,
        maxConfigurations: 15
      }
      requestStub = { params: { id: orgId } }
    })

    beforeEach('Stub out methods', () => {
      getOrganizationStub = sinon.stub(bigPoppa, 'getOrganization').resolves(org)
      getSubscriptionForOrganizationStub = sinon.stub(stripe, '_getSubscriptionForOrganization').resolves(subscription)
      getPlanIdForOrganizationBasedOnCurrentUsageStub = sinon.stub(stripe, 'getPlanIdForOrganizationBasedOnCurrentUsage').resolves(planId)
      getDiscountStub = sinon.stub(stripe, 'getDiscount').resolves(null)
      getPlanStub = sinon.stub(stripe, 'getPlan')
      getPlanStub.withArgs(planId).resolves(nextStripePlan)
      getPlanStub.withArgs(subscriptionPlanId).resolves(currentStripePlan)
    })
    afterEach('Restore methods', () => {
      getOrganizationStub.restore()
      getSubscriptionForOrganizationStub.restore()
      getPlanIdForOrganizationBasedOnCurrentUsageStub.restore()
      getDiscountStub.restore()
      getPlanStub.restore()
    })

    it('should fetch the organization', () => {
      return OrganizationRouter.getPlan(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(getOrganizationStub)
          sinon.assert.calledWithExactly(getOrganizationStub, orgId)
        })
    })

    it('should get the subscription for the org', () => {
      return OrganizationRouter.getPlan(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(getSubscriptionForOrganizationStub)
          sinon.assert.calledWithExactly(getSubscriptionForOrganizationStub, orgStripeCustomerId)
        })
    })

    it('should get the discount for the org', () => {
      return OrganizationRouter.getPlan(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(getDiscountStub)
          sinon.assert.calledWithExactly(getDiscountStub, orgStripeCustomerId)
        })
    })

    it('should get the plan id for the org based on current usage', () => {
      return OrganizationRouter.getPlan(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(getPlanIdForOrganizationBasedOnCurrentUsageStub)
          sinon.assert.calledWithExactly(getPlanIdForOrganizationBasedOnCurrentUsageStub, orgGithubId)
        })
    })

    it('should fetch the plans for the Stripe plans', () => {
      return OrganizationRouter.getPlan(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledTwice(getPlanStub)
          sinon.assert.calledWithExactly(getPlanStub, planId)
          sinon.assert.calledWithExactly(getPlanStub, subscriptionPlanId)
        })
    })

    it('should return a propertly formatted `current` plan', () => {
      return OrganizationRouter.getPlan(requestStub, responseStub)
        .then(() => {
          expect(responseStub).to.have.deep.property('json.firstCall.args[0].current')
          let currentPlan = responseStub.json.firstCall.args[0].current
          expect(currentPlan).to.be.an('object')
          expect(currentPlan).to.have.property('id', subscriptionPlanId)
          expect(currentPlan).to.have.property('price', currentStripePlan.price)
          expect(currentPlan).to.have.property('maxConfigurations', currentStripePlan.maxConfigurations)
          expect(currentPlan).to.have.property('userCount', users.length)
        })
    })

    it('should return a propertly formatted `current` plan', () => {
      return OrganizationRouter.getPlan(requestStub, responseStub)
        .then(() => {
          expect(responseStub).to.have.deep.property('json.firstCall.args[0].next')
          let nextPlan = responseStub.json.firstCall.args[0].next
          expect(nextPlan).to.be.an('object')
          expect(nextPlan).to.have.property('id', planId)
          expect(nextPlan).to.have.property('price', nextStripePlan.price)
          expect(nextPlan).to.have.property('maxConfigurations', nextStripePlan.maxConfigurations)
          expect(nextPlan).to.have.property('userCount', 3)
        })
    })

    it('should return `null` as a userCount if there is not users array', () => {
      delete subscription.metadata.users

      return OrganizationRouter.getPlan(requestStub, responseStub)
        .then(() => {
          expect(responseStub).to.have.deep.property('json.firstCall.args[0].current')
          let currentPlan = responseStub.json.firstCall.args[0].current
          expect(currentPlan).to.be.an('object')
          expect(currentPlan).to.have.property('id', subscriptionPlanId)
          expect(currentPlan).to.have.property('userCount', null)
        })
    })

    it('should return a discount if a discount exists', () => {
      const discount = {
        start: 1,
        end: 2,
        coupon: {}
      }
      getDiscountStub.resolves(discount)

      return OrganizationRouter.getPlan(requestStub, responseStub)
        .then(response => {
          expect(responseStub).to.have.deep.property('json.firstCall.args[0].discount')
          let discountResponse = responseStub.json.firstCall.args[0].discount
          expect(discountResponse).to.equal(discount)
        })
    })

    it('should call `status` and `json`', () => {
      return OrganizationRouter.getPlan(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 200)
          sinon.assert.calledOnce(responseStub.json)
          sinon.assert.calledWithExactly(responseStub.json, sinon.match.object)
        })
    })
  })

  describe('#getPaymentMethod', () => {
    let requestStub
    let getOrganizationStub
    let getCustomerStub
    let org = Object.assign({}, OrganizationWithStripeCustomerIdFixture)
    let orgId = org.id
    let stripeCustomerId = org.stripeCustomerId
    let customer
    let paymentMethodOwnerId = 829
    let paymentMethodOwnerGithubId = 1981198
    let expMonth = 12
    let expYear = 2020
    let last4 = 7896

    beforeEach(() => {
      requestStub = { params: { id: orgId } }
      customer = {
        metadata: {
          paymentMethodOwnerId: paymentMethodOwnerId,
          paymentMethodOwnerGithubId: paymentMethodOwnerGithubId
        },
        sources: {
          data: [ // No reason to have
            {
              object: 'card',
              exp_month: expMonth,
              exp_year: expYear,
              last4: last4,
              brand: 'Visa'
            }
          ]
        }
      }
    })

    beforeEach('Stub out', () => {
      getOrganizationStub = sinon.stub(bigPoppa, 'getOrganization').resolves(org)
      getCustomerStub = sinon.stub(stripe, 'getCustomer').resolves(customer)
    })
    afterEach(() => {
      getOrganizationStub.restore()
      getCustomerStub.restore()
    })

    it('should call `getOrganization`', () => {
      return OrganizationRouter.getPaymentMethod(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(getOrganizationStub)
          sinon.assert.calledWithExactly(getOrganizationStub, orgId)
        })
    })

    it('should call `getCustomer`', () => {
      return OrganizationRouter.getPaymentMethod(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(getCustomerStub)
          sinon.assert.calledWithExactly(getCustomerStub, stripeCustomerId)
        })
    })

    it('should handle an organization not having any payment methods', () => {
      customer.sources = null
      getCustomerStub.resolves(customer)

      return OrganizationRouter.getPaymentMethod(requestStub, responseStub)
        .then(() => {
          sinon.assert.called(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 404)
          sinon.assert.notCalled(responseStub.json)
        })
    })

    it('should handle an organization not having card', () => {
      customer.sources.data[0].object = 'something-else-thats-not-a-card'
      getCustomerStub.resolves(customer)

      return OrganizationRouter.getPaymentMethod(requestStub, responseStub)
        .then(() => {
          sinon.assert.called(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 404)
          sinon.assert.notCalled(responseStub.json)
        })
    })

    it('should have the necessary payment method properties', () => {
      return OrganizationRouter.getPaymentMethod(requestStub, responseStub)
        .then(() => {
          let res = responseStub.json.firstCall.args[0]
          let card = res.card
          expect(card).to.have.property('expMonth', expMonth)
          expect(card).to.have.property('expYear', expYear)
          expect(card).to.have.property('last4', last4)
          expect(card).to.have.property('brand', 'Visa')
        })
    })

    it('should not get the payment method id and customer', () => {
      return OrganizationRouter.getPaymentMethod(requestStub, responseStub)
        .then(() => {
          let res = responseStub.json.firstCall.args[0]
          let card = res.card
          expect(card).to.not.have.property('id')
          expect(card).to.not.have.property('customer')
        })
    })

    it('should have the necessary user properties', () => {
      return OrganizationRouter.getPaymentMethod(requestStub, responseStub)
        .then(() => {
          let res = responseStub.json.firstCall.args[0]
          let owner = res.owner
          expect(owner).to.have.property('id', paymentMethodOwnerId)
          expect(owner).to.have.property('githubId', paymentMethodOwnerGithubId)
        })
    })

    it('should call `status` and `json`', () => {
      return OrganizationRouter.getPaymentMethod(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 200)
          sinon.assert.calledOnce(responseStub.json)
        })
    })
  })

  describe('#postPaymentMethod', () => {
    let requestStub
    let getOrganizationStub
    let updatePaymentMethodForOrganizationStub
    let updateOrganizationStub
    let org = Object.assign({}, OrganizationWithStripeCustomerIdFixture)
    let orgId = org.id
    let user = org.users[0]
    let userId = user.id
    let stripeTokenId = 'tok_18PE8zLYrJgOrBWzlTPEUiET'

    beforeEach(() => {
      requestStub = {
        params: { id: orgId },
        body: {
          stripeToken: stripeTokenId,
          user: { id: userId }
        }
      }
    })

    beforeEach('Stub out', () => {
      getOrganizationStub = sinon.stub(bigPoppa, 'getOrganization').resolves(org)
      updateOrganizationStub = sinon.stub(bigPoppa, 'updateOrganization').resolves(org)
      updatePaymentMethodForOrganizationStub = sinon.stub(stripe, 'updatePaymentMethodForOrganization').resolves()
    })
    afterEach('Restore stub', () => {
      getOrganizationStub.restore()
      updateOrganizationStub.restore()
      updatePaymentMethodForOrganizationStub.restore()
    })

    it('should call `getOrganization`', () => {
      return OrganizationRouter.postPaymentMethod(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(getOrganizationStub)
          sinon.assert.calledWithExactly(
            getOrganizationStub,
            orgId
          )
        })
    })

    it('should update the `hasPaymentMethod` property to `true`', () => {
      return OrganizationRouter.postPaymentMethod(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(updateOrganizationStub)
          sinon.assert.calledWithExactly(
            updateOrganizationStub,
            orgId,
            { hasPaymentMethod: true }
          )
        })
    })

    it('should update the organization', () => {
      return OrganizationRouter.postPaymentMethod(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(updatePaymentMethodForOrganizationStub)
          sinon.assert.calledWithExactly(
            updatePaymentMethodForOrganizationStub,
            org,
            stripeTokenId,
            user
          )
        })
    })

    it('should call `status` and `send`', () => {
      return OrganizationRouter.postPaymentMethod(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 201)
          sinon.assert.calledOnce(responseStub.send)
          sinon.assert.calledWith(responseStub.send, 'Successfully updated')
        })
    })

    it('should throw a `UserNotPartOfOrganizationError` if the user is part of the organization', done => {
      requestStub.body.user.id = 23423423
      OrganizationRouter.postPaymentMethod(requestStub, responseStub)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(UserNotPartOfOrganizationError)
          done()
        })
    })
  })
})
