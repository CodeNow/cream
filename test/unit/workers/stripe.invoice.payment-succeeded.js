'use strict'

const Promise = require('bluebird')
const Joi = require('util/joi')
const expect = require('chai').expect
const sinon = require('sinon')
const testUtil = require('../../util')
require('sinon-as-promised')(Promise)

const stripe = require('util/stripe')
const bigPoppa = require('util/big-poppa')
const moment = require('moment')

const OrganizationsFixture = require('../../fixtures/big-poppa/organizations')
const EntityNotFoundError = require('errors/entity-not-found-error')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const ProcessPaymentSucceeded = require('workers/stripe.invoice.payment-succeeded').task
const ProcessPaymentSucceededSchema = require('workers/stripe.invoice.payment-succeeded').jobSchema

describe('#stripe.invoice.payment-succeeded', () => {
  let validJob
  let tid = '6ab33f93-118a-4a03-bee4-89ddebeab346'
  let eventId = 'evt_18hnDuLYrJgOrBWzZG8Oz0Rv'
  let orgId = OrganizationsFixture[0].id
  let stripeCustomerId = 'cus_8tkDWhVUigbGSQ'
  let getEventStub
  let getOrganizationsStub
  let updateOrganizationStub
  let stripeEvent
  let getSubscriptionForOrganizationStub
  let subscription
  let activePeriodEnd = moment(1471050735, 'X')

  beforeEach(() => {
    validJob = { tid: tid, stripeEventId: eventId }
    stripeEvent = {
      id: eventId,
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          object: 'invoice',
          customer: stripeCustomerId,
          lines: {
            data: [
              {
                period: {
                  start: 123,
                  end: 23423
                },
                type: 'invoiceitem'
              },
              {
                period: {
                  start: 123,
                  end: activePeriodEnd.format('X')
                },
                type: 'subscription'
              }
            ]
          }
        }
      }
    }
    subscription = {
      status: 'active',
      current_period_end: activePeriodEnd.format('X')
    }
  })

  beforeEach('Stub out', () => {
    getOrganizationsStub = sinon.stub(bigPoppa, 'getOrganizations').resolves(OrganizationsFixture)
    updateOrganizationStub = sinon.stub(bigPoppa, 'updateOrganization').resolves()
    getEventStub = sinon.stub(stripe, 'getEvent').resolves(stripeEvent)
    getSubscriptionForOrganizationStub = sinon.stub(stripe, 'getSubscriptionForOrganization').resolves(subscription)
  })
  afterEach('Restore stubs', () => {
    getOrganizationsStub.restore()
    updateOrganizationStub.restore()
    getEventStub.restore()
    getSubscriptionForOrganizationStub.restore()
  })

  describe('Validation', () => {
    it('should not validate if `tid` is not a uuid', done => {
      Joi.validateAsync({ tid: 'world' }, ProcessPaymentSucceededSchema)
        .asCallback(err => {
          expect(err).to.exist
          expect(err.isJoi).to.equal(true)
          expect(err.message).to.match(/tid/i)
          done()
        })
    })

    it('should not validate if `stripeCustomerId` is not passed', done => {
      Joi.validateAsync({ tid: tid }, ProcessPaymentSucceededSchema)
        .asCallback(err => {
          expect(err).to.exist
          expect(err.isJoi).to.equal(true)
          expect(err.message).to.match(/id/i)
          done()
        })
    })

    it('should validate if a valid job is passed', () => {
      return Joi.validateAsync(validJob, ProcessPaymentSucceededSchema)
    })
  })

  describe('Errors', () => {
    it('should throw a `WorkerStopError` if the event is invalid', done => {
      let newEvent = Object.assign({}, stripeEvent, { type: 'this-event-does-not-exist' })
      getEventStub.resolves(newEvent)

      return ProcessPaymentSucceeded(validJob)
        .then(testUtil.throwIfSuccess)
        .catch(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err).to.match(/validation/i)
          done()
        })
    })

    it('should throw a `WorkerStopError` if no orgs are found', done => {
      getOrganizationsStub.resolves([])

      ProcessPaymentSucceeded(validJob)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err).to.match(/stripeCustomerId/i)
          done()
        })
    })

    it('should throw any unhandled errors', done => {
      let thrownErr = new Error()
      getOrganizationsStub.rejects(thrownErr)

      ProcessPaymentSucceeded(validJob)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
          done()
        })
    })

    it('should throw a `WorkerStopError` if there are no subscriptions', done => {
      getSubscriptionForOrganizationStub.rejects(new EntityNotFoundError('No subscription found'))

      ProcessPaymentSucceeded(validJob)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err).to.match(/no.*subscription.*found/i)
          done()
        })
    })

    it('should throw a `WorkerStopError` if the invoice is for a trial', done => {
      // Make this a trial subscription
      subscription.status = 'trialing'
      getOrganizationsStub.resolves(subscription)

      ProcessPaymentSucceeded(validJob)
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err).to.match(/subscription.*not.*active/i)
          done()
        })
    })
  })

  describe('Main Functionality', () => {
    it('should successfully complete a valid job', () => {
      return ProcessPaymentSucceeded(validJob)
    })

    it('should fetch the organization', () => {
      return ProcessPaymentSucceeded(validJob)
        .then(() => {
          sinon.assert.calledOnce(getEventStub)
          sinon.assert.calledWithExactly(getEventStub, eventId)
        })
    })

    it('should fetch the organization', () => {
      return ProcessPaymentSucceeded(validJob)
        .then(() => {
          sinon.assert.calledOnce(getOrganizationsStub)
          sinon.assert.calledWithExactly(getOrganizationsStub, { stripeCustomerId: stripeCustomerId })
        })
    })

    it('should fetch the subscription', () => {
      return ProcessPaymentSucceeded(validJob)
        .then(() => {
          sinon.assert.calledOnce(getSubscriptionForOrganizationStub)
          sinon.assert.calledWithExactly(getSubscriptionForOrganizationStub, stripeCustomerId)
        })
    })

    it('should update the organization', () => {
      return ProcessPaymentSucceeded(validJob)
        .then(() => {
          sinon.assert.calledOnce(updateOrganizationStub)
          sinon.assert.calledWithExactly(
            updateOrganizationStub,
            orgId,
            { activePeriodEnd: activePeriodEnd.toISOString() }
          )
        })
    })
  })
})
