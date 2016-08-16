'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)
const expect = require('chai').expect

const express = require('express')

const OrganizationWithStripeCustomerIdFixture = require('../../../fixtures/big-poppa/organization-with-stripe-customer-id')

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

    beforeEach(() => {
      requestStub = { query: {} }
    })

    it('should call `status` and `send`', () => {
      return OrganizationRouter.getInvoices(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 501)
          sinon.assert.calledOnce(responseStub.send)
          sinon.assert.calledWith(responseStub.send, 'Not yet implemented')
        })
    })
  })

  describe('#getPlan', () => {
    let requestStub

    beforeEach(() => {
      requestStub = { query: {} }
    })

    it('should call `status` and `send`', () => {
      return OrganizationRouter.getPlan(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 501)
          sinon.assert.calledOnce(responseStub.send)
          sinon.assert.calledWith(responseStub.send, 'Not yet implemented')
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
    let org = OrganizationWithStripeCustomerIdFixture
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
