'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))
const expect = require('chai').expect
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const stripe = require('util/stripe')
const bigPoppa = require('util/big-poppa')

const OrganizationsFixture = require('../../fixtures/big-poppa/organizations')

const ProcessPaymentSucceeded = require('workers/stripe.invoice.payment-succeeded').task
const ProcessPaymentSucceededSchema = require('workers/stripe.invoice.payment-succeeded').jobSchema

describe('#stripe.invoice.payment-succeeded', () => {
  let validJob
  let tid = '6ab33f93-118a-4a03-bee4-89ddebeab346'
  let eventId = 'evt_18hnDuLYrJgOrBWzZG8Oz0Rv'
  let stripeCustomerId = 'cus_8tkDWhVUigbGSQ'
  let getEventStub
  let getOrganizationsStub
  let updateOrganizationStub
  let stripeEvent

  beforeEach(() => {
    validJob = { tid: tid, id: eventId }
    stripeEvent = {
      id: eventId,
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          object: 'invoice',
          customer: stripeCustomerId,
          period_end: 1471050735
        }
      }
    }
  })

  beforeEach('Stub out', () => {
    getOrganizationsStub = sinon.stub(bigPoppa, 'getOrganizations').resolves(OrganizationsFixture)
    updateOrganizationStub = sinon.stub(bigPoppa, 'updateOrganization').resolves()
    getEventStub = sinon.stub(stripe, 'getEvent').resolves(stripeEvent)
  })
  afterEach('Restore stubs', () => {
    getOrganizationsStub.restore()
    updateOrganizationStub.restore()
    getEventStub.restore()
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

  xdescribe('Errors', () => {})

  describe('Main Functionality', () => {
    it('should succsefully complete a valid job', () => {
      return ProcessPaymentSucceeded(validJob)
    })
  })
})
