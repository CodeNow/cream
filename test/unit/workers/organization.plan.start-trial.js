'use strict'

const Promise = require('bluebird')
const expect = require('chai').expect
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const bigPoppa = require('util/big-poppa')
const stripe = require('util/stripe')

const EntityExistsInStripeError = require('errors/entity-exists-error')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const CreateOrganizationInStripeAndStartTrial = require('workers/organization.plan.start-trial')

describe('#organization.plan.start-trial', () => {
  let validJob
  let tid = '6ab33f93-118a-4a03-bee4-89ddebeab346'
  let organizationId = 67898
  let getOrganizationStub
  let updateOrganizationStub
  let createCustomerStub
  let org
  let stripeCustomerId = 'cus_23423432'
  let trialEnd = 2342342

  beforeEach(() => {
    validJob = { organization: { id: organizationId } }
  })

  beforeEach(() => {
    org = { id: organizationId }
    getOrganizationStub = sinon.stub(bigPoppa, 'getOrganization').resolves(org)
    updateOrganizationStub = sinon.stub(bigPoppa, 'updateOrganization').resolves(org)
    createCustomerStub = sinon.stub(stripe, 'createCustomerAndSubscriptionForOrganization').resolves({
      customer: {
        id: stripeCustomerId
      },
      subscription: {
        trial_end: trialEnd
      }
    })
  })

  afterEach(() => {
    getOrganizationStub.restore()
    updateOrganizationStub.restore()
    createCustomerStub.restore()
  })

  describe('Validation', () => {
    it('should not validate if `tid` is not a uuid', done => {
      CreateOrganizationInStripeAndStartTrial({ tid: 'world' })
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err.message).to.match(/invalid.*job/i)
          expect(err.message).to.match(/tid/i)
          done()
        })
    })

    it('should not validate if `organization.id` is not passed', done => {
      CreateOrganizationInStripeAndStartTrial({ tid: tid })
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err.message).to.match(/invalid.*job/i)
          expect(err.message).to.match(/organization/i)
          done()
        })
    })

    it('should validate if a valid job is passed', () => {
      return CreateOrganizationInStripeAndStartTrial(validJob)
    })
  })

  describe('Errors', () => {
    it('should throw an error if no `trialEnd` is specified by the subscription', done => {
      createCustomerStub.resolves({
        customer: {},
        subscription: {}
      })

      CreateOrganizationInStripeAndStartTrial(validJob)
        .asCallback(err => {
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err.message).to.include('trialEnd')
          done()
        })
    })

    it('should throw a `WorkerStopError` if an `EntityExistsInStripeError` is received', done => {
      let thrownErr = new EntityExistsInStripeError('')
      createCustomerStub.rejects(thrownErr)

      CreateOrganizationInStripeAndStartTrial(validJob)
        .asCallback(err => {
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err.data.err).to.equal(thrownErr)
          done()
        })
    })

    it('should throw the error if the error was unexpected', done => {
      let thrownErr = new Error('some unexpected error')
      createCustomerStub.rejects(thrownErr)

      CreateOrganizationInStripeAndStartTrial(validJob)
        .asCallback(err => {
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('Main Functionality', () => {
    it('should get the organization', () => {
      return CreateOrganizationInStripeAndStartTrial(validJob)
        .then(() => {
          sinon.assert.calledOnce(getOrganizationStub)
          sinon.assert.calledWithExactly(
            getOrganizationStub,
            organizationId
          )
        })
    })

    it('should create the customer', () => {
      return CreateOrganizationInStripeAndStartTrial(validJob)
        .then(() => {
          sinon.assert.calledOnce(createCustomerStub)
          sinon.assert.calledWithExactly(
            createCustomerStub,
            org
          )
        })
    })

    it('should update the organization', () => {
      return CreateOrganizationInStripeAndStartTrial(validJob)
        .then(() => {
          sinon.assert.calledOnce(updateOrganizationStub)
          sinon.assert.calledWithExactly(
            updateOrganizationStub,
            organizationId,
            {
              stripeCustomerId: stripeCustomerId,
              trialEnd: trialEnd
            }
          )
        })
    })
  })
})
