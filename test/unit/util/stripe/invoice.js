'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
const expect = require('chai').expect
require('sinon-as-promised')(Promise)

const StripeInvoiceUtils = require('util/stripe/invoice')
const EntityNotFoundError = require('errors/entity-not-found-error')
const stripeClient = require('util/stripe/client')

describe('StripeInvoiceUtils', function () {
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

  describe('#getInvoice', () => {
    let getInvoiceStub
    const invoiceId = 'in_234234'
    const invoice = {}

    beforeEach('stub out Stripe API calls', () => {
      getInvoiceStub = sinon.stub(stripeClient.invoices, 'retrieve').resolves(invoice)
    })

    afterEach('restore Stripe API calls', () => {
      getInvoiceStub.restore()
    })

    it('should fetch the invoice', () => {
      return StripeInvoiceUtils.get(invoiceId)
        .then(res => {
          sinon.assert.calledOnce(getInvoiceStub)
          sinon.assert.calledWithExactly(
            getInvoiceStub,
            invoiceId
          )
          expect(res).to.equal(invoice)
        })
    })

    it('should return ', () => {
      return StripeInvoiceUtils.get(invoiceId)
        .then(res => {
        })
    })

    it('should throw an EntityNotFoundError if the invoice is not found', done => {
      let thrownErr = new Error('No such invoice: asdfasdf')
      thrownErr.type = 'invalid_request_error'
      getInvoiceStub.rejects(thrownErr)

      StripeInvoiceUtils.get(invoice)
        .asCallback(err => {
          expect(err).to.be.an.instanceof(EntityNotFoundError)
          done()
        })
    })

    it('should throw any errors', done => {
      let thrownErr = new Error('hello')
      getInvoiceStub.rejects(thrownErr)

      StripeInvoiceUtils.get(invoiceId)
        .asCallback(err => {
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('#updateWithPaymentMethodOwner', () => {
    let invoiceId = 'in_18i5aXLYrJgOrBWzYNR9xq87'
    let customer
    let retrieveCustomerStub
    let __updateMetadataStubdataStub

    beforeEach('Stub out method', () => {
      customer = {}
      retrieveCustomerStub = sinon.stub(stripeClient.customers, 'retrieve').resolves(customer)
      __updateMetadataStubdataStub = sinon.stub(StripeInvoiceUtils, '_updateMetadata').resolves()
    })

    afterEach('Restore stub', () => {
      retrieveCustomerStub.restore()
      __updateMetadataStubdataStub.restore()
    })

    it('should retrieve the customer', () => {
      return StripeInvoiceUtils.updateWithPaymentMethodOwner(orgMock, invoiceId)
        .then(() => {
          sinon.assert.calledOnce(retrieveCustomerStub)
          sinon.assert.calledWithExactly(
            retrieveCustomerStub,
            stripeCustomerId
          )
        })
    })

    it('should update the invoice metadata', () => {
      return StripeInvoiceUtils.updateWithPaymentMethodOwner(orgMock, invoiceId)
        .then(() => {
          sinon.assert.calledOnce(__updateMetadataStubdataStub)
          sinon.assert.calledWithExactly(
            __updateMetadataStubdataStub,
            invoiceId,
            customer
          )
        })
    })

    it('should throw any errors throwns by the client', done => {
      let thrownErr = new Error()
      __updateMetadataStubdataStub.rejects(thrownErr)

      StripeInvoiceUtils.updateWithPaymentMethodOwner(orgMock, invoiceId)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('_updateMetadata', () => {
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
      return StripeInvoiceUtils._updateMetadata(invoiceId, customer)
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

    it('should throw any errors thrown by the client', done => {
      let thrownErr = new Error()
      updateInvoiceStub.rejects(thrownErr)

      StripeInvoiceUtils._updateMetadata(invoiceId, customer)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('#updateNotifiedAdminPaymentFailed', () => {
    let updateInvoiceStub
    const invoiceId = 'in_18i5aXLYrJgOrBWzYNR9xq87'
    const userId = 23423
    const notificationSentTime = '2016-09-15T17:59:43.468Z'

    beforeEach('Stub out method', () => {
      updateInvoiceStub = sinon.stub(stripeClient.invoices, 'update').resolves()
    })

    afterEach('Restore stub', () => {
      updateInvoiceStub.restore()
    })

    it('should update the invoice with the corrrect metadata', () => {
      StripeInvoiceUtils.updateNotifiedAdminPaymentFailed(invoiceId, userId, notificationSentTime)
        .then(() => {
          sinon.assert.calledOnce(updateInvoiceStub)
          sinon.assert.calledWithExactly(
            updateInvoiceStub,
            invoiceId,
            {
              metadata: {
                notifiedAdminPaymentFailedUserId: userId,
                notifiedAdminPaymentFailed: notificationSentTime
              }
            }
          )
        })
    })

    it('should throw any errors thrown by the client', done => {
      let thrownErr = new Error()
      updateInvoiceStub.rejects(thrownErr)

      StripeInvoiceUtils.updateNotifiedAdminPaymentFailed(invoiceId, userId, notificationSentTime)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })
})
