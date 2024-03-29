'use strict'

const Promise = require('bluebird')
const Joi = require('util/joi')
const sinon = require('sinon')
const testUtil = require('../../util')
require('sinon-as-promised')(Promise)
const expect = require('chai').expect

const rabbitmq = require('util/rabbitmq')
const stripe = require('util/stripe')
const bigPoppa = require('util/big-poppa')

const OrganizationsFixture = require('../../fixtures/big-poppa/organizations')

const WorkerStopError = require('error-cat/errors/worker-stop-error')

const ProcessInvoiceCreated = require('workers/stripe.invoice.created').task
const ProcessInvoiceCreatedSchema = require('workers/stripe.invoice.created').jobSchema

describe('#stripe.invoice.created', () => {
  let validJob
  // let stripeCustomerId = 'cus_8tkDWhVUigbGSQ'
  let getOrganizationsStub
  let updatePlanIdForOrganizationBasedOnCurrentUsageStub
  let updateInvoiceWithPaymentMethodOwnerStub
  let getEventStub
  let org = Object.assign({}, OrganizationsFixture[0], { hasPaymentMethod: true })
  let eventId = 'evt_18hnDuLYrJgOrBWzZG8Oz0Rv'
  let invoiceId = 'in_18hkxrLYrJgOrBWzgthSRr9M'
  let stripeCustomerId = org.stripeCustomerId
  let stripeEvent
  let publishTaskStub

  beforeEach(() => {
    validJob = { stripeEventId: eventId }
    stripeEvent = {
      id: eventId,
      type: 'invoice.created', // Don't allow any other type of event
      data: {
        object: {
          object: 'invoice',
          id: invoiceId,
          closed: false,
          customer: stripeCustomerId,
          period_end: 1471036920,
          paid: false
        }
      }
    }
  })

  beforeEach('Stub out', () => {
    getOrganizationsStub = sinon.stub(bigPoppa, 'getOrganizations').resolves([org])
    updateInvoiceWithPaymentMethodOwnerStub = sinon.stub(stripe.invoices, 'updateWithPaymentMethodOwner').resolves()
    updatePlanIdForOrganizationBasedOnCurrentUsageStub = sinon.stub(stripe.subscriptions, 'updatePlanIdForOrganizationBasedOnCurrentUsage').resolves()
    getEventStub = sinon.stub(stripe, 'getEvent').resolves(stripeEvent)
    publishTaskStub = sinon.stub(rabbitmq, 'publishTask')
  })
  afterEach(() => {
    getOrganizationsStub.restore()
    updatePlanIdForOrganizationBasedOnCurrentUsageStub.restore()
    updateInvoiceWithPaymentMethodOwnerStub.restore()
    getEventStub.restore()
    publishTaskStub.restore()
  })

  describe('Validation', () => {
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

  describe('Errors', () => {
    it('should throw a `WorkerStopError` if the event is invalid', done => {
      let newEvent = Object.assign({}, stripeEvent, { type: 'this-event-does-not-exist' })
      getEventStub.resolves(newEvent)

      return ProcessInvoiceCreated(validJob)
        .then(testUtil.throwIfSuccess)
        .catch(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err).to.match(/validation/i)
          done()
        })
    })

    it('should throw a `WorkerStopError` if nor org is found', done => {
      getOrganizationsStub.resolves([])
      ProcessInvoiceCreated(validJob)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err.message).to.match(/stripeCustomerId/i)
          done()
        })
    })
  })

  describe('Main Functionality', () => {
    it('should call `getEvent`', () => {
      return ProcessInvoiceCreated(validJob)
        .then(() => {
          sinon.assert.calledOnce(getEventStub)
          sinon.assert.calledWithExactly(
            getEventStub,
            validJob.stripeEventId
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

    describe('Paying Invoices', () => {
      it('should not pay the invoice if already paid', () => {
        stripeEvent.data.object.paid = true
        return ProcessInvoiceCreated(validJob)
          .then(() => {
            sinon.assert.notCalled(publishTaskStub)
          })
      })

      it('should pay the invoice if not paid and not closed', () => {
        return ProcessInvoiceCreated(validJob)
          .then(() => {
            sinon.assert.calledOnce(publishTaskStub)
            sinon.assert.calledWith(
              publishTaskStub,
              'organization.invoice.pay',
              {
                invoice: { id: invoiceId },
                organization: { id: org.id }
              }
            )
          })
      })

      it('should not pay the invoice if closed', () => {
        stripeEvent.data.object.closed = true
        return ProcessInvoiceCreated(validJob)
          .then(() => {
            sinon.assert.notCalled(publishTaskStub)
          })
      })

      it('should not pay the invoice if the organization doesnt have a payment method', () => {
        org.hasPaymentMethod = false
        return ProcessInvoiceCreated(validJob)
          .then(() => {
            sinon.assert.notCalled(publishTaskStub)
          })
      })
    })
  })
})
