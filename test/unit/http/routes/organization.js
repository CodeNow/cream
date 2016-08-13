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

describe('HTTP /organization', () => {
  let responseStub

  beforeEach(() => {
    responseStub = {
      status: sinon.stub().returnsThis(),
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

    beforeEach(() => {
      requestStub = { query: {} }
    })

    it('should call `status` and `send`', () => {
      return OrganizationRouter.getPaymentMethod(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 501)
          sinon.assert.calledOnce(responseStub.send)
          sinon.assert.calledWith(responseStub.send, 'Not yet implemented')
        })
    })
  })

  describe('#postPaymentMethod', () => {
    let requestStub
    let getOrganizationStub
    let updatePaymentMethodForOrganizationStub
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
      updatePaymentMethodForOrganizationStub = sinon.stub(stripe, 'updatePaymentMethodForOrganization').resolves()
    })
    afterEach(() => {
      getOrganizationStub.restore()
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

    it('should call `updatePaymentMethodForOrganization`', () => {
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
          sinon.assert.calledWith(responseStub.send, 'Succsefully updated')
        })
    })
  })
})
