'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))
const sinon = require('sinon')
require('sinon-as-promised')(Promise)
const expect = require('chai').expect

const stripe = require('util/stripe')
const bigPoppa = require('util/big-poppa')

const OrganizationsFixture = require('../../fixtures/big-poppa/organizations')

const ProcessInvoiceCreated = require('workers/stripe.invoice.created').task
const ProcessInvoiceCreatedSchema = require('workers/stripe.invoice.created').jobSchema

describe('#stripe.invoice.created', () => {
  let validJob
  // let stripeCustomerId = 'cus_8tkDWhVUigbGSQ'
  let getOrganizationsStub
  let updatePlanIdForOrganizationBasedOnCurrentUsageStub
  let updateInvoiceWithPaymentMethodOwnerStub
  let getEventStub
  let org = OrganizationsFixture[0]
  let eventId = 'evt_18hnDuLYrJgOrBWzZG8Oz0Rv'
  let invoiceId = 'in_18hkxrLYrJgOrBWzgthSRr9M'
  let stripeCustomerId = org.stripeCustomerId
  let stripeEvent

  beforeEach(() => {
    validJob = { id: eventId }
    stripeEvent = {
      id: eventId,
      type: 'invoice.created', // Don't allow any other type of event
      data: {
        object: {
          object: 'invoice',
          id: invoiceId,
          customer: stripeCustomerId,
          period_end: 1471036920
        }
      }
    }
  })

  beforeEach('Stub out', () => {
    getOrganizationsStub = sinon.stub(bigPoppa, 'getOrganizations').resolves(OrganizationsFixture)
    updatePlanIdForOrganizationBasedOnCurrentUsageStub = sinon.stub(stripe, 'updatePlanIdForOrganizationBasedOnCurrentUsage').resolves()
    updateInvoiceWithPaymentMethodOwnerStub = sinon.stub(stripe, 'updateInvoiceWithPaymentMethodOwner').resolves()
    getEventStub = sinon.stub(stripe, 'getEvent').resolves(stripeEvent)
  })
  afterEach(() => {
    getOrganizationsStub.restore()
    updatePlanIdForOrganizationBasedOnCurrentUsageStub.restore()
    updateInvoiceWithPaymentMethodOwnerStub.restore()
    getEventStub.restore()
  })

  describe('Validation', () => {
    it('should not validate if `tid` is not a uuid', done => {
      Joi.validateAsync({ tid: 'world' }, ProcessInvoiceCreatedSchema)
        .asCallback(err => {
          expect(err).to.exist
          expect(err.isJoi).to.equal(true)
          expect(err.message).to.match(/tid/i)
          done()
        })
    })

    it('should not validate if `id` is not passed', done => {
      Joi.validateAsync({ tid: 'world' }, ProcessInvoiceCreatedSchema)
        .asCallback(err => {
          expect(err).to.exist
          expect(err.isJoi).to.equal(true)
          expect(err.message).to.match(/id/i)
          done()
        })
    })

    it('should validate if a valid job is passed', () => {
      return Joi.validateAsync(validJob, ProcessInvoiceCreatedSchema)
    })
  })

  xdescribe('Errors', () => {})

  describe('Main Functionality', () => {
    it('should call `getEvent`', () => {
      return ProcessInvoiceCreated(validJob)
        .then(() => {
          sinon.assert.calledOnce(getEventStub)
          sinon.assert.calledWithExactly(
            getEventStub,
            validJob.id
          )
        })
    })
    it('should call `getOrganizations`', () => {
      return ProcessInvoiceCreated(validJob)
        .then(() => {
          sinon.assert.calledOnce(getOrganizationsStub)
          sinon.assert.calledWithExactly(
            getOrganizationsStub,
            { stripeCustomerId: stripeCustomerId }
          )
        })
    })

    it('should call `updatePlanIdForOrganizationBasedOnCurrentUsage`', () => {
      return ProcessInvoiceCreated(validJob)
        .then(() => {
          sinon.assert.calledOnce(updatePlanIdForOrganizationBasedOnCurrentUsageStub)
          sinon.assert.calledWithExactly(
            updatePlanIdForOrganizationBasedOnCurrentUsageStub,
            org
          )
        })
    })

    it('should call `updateInvoiceWithPaymentMethodOwner`', () => {
      return ProcessInvoiceCreated(validJob)
        .then(() => {
          sinon.assert.calledOnce(updateInvoiceWithPaymentMethodOwnerStub)
          sinon.assert.calledWithExactly(
            updateInvoiceWithPaymentMethodOwnerStub,
            org,
            invoiceId
          )
        })
    })
  })
})
