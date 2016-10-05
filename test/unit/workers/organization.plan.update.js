'use strict'

const Promise = require('bluebird')
const Joi = require('util/joi')
const expect = require('chai').expect
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const bigPoppa = require('util/big-poppa')
const stripe = require('util/stripe')

const WorkerStopError = require('error-cat/errors/worker-stop-error')

const UpdatPlan = require('workers/organization.plan.update').task
const UpdatPlanSchema = require('workers/organization.plan.update').jobSchema

describe('#organization.plan.update', () => {
  let validJob
  let tid = '6ab33f93-118a-4a03-bee4-89ddebeab346'
  let organizationId = 67898
  let getOrganizationStub
  let updateUsersForPlanStub
  let org
  let orgCustomerId = 'cus_wwer823j23'

  beforeEach(() => {
    org = { id: organizationId, stripeCustomerId: orgCustomerId }
    validJob = { organization: { id: organizationId } }
  })

  beforeEach(() => {
    getOrganizationStub = sinon.stub(bigPoppa, 'getOrganization').resolves(org)
    updateUsersForPlanStub = sinon.stub(stripe, 'updateUsersForPlan').resolves()
  })

  afterEach(() => {
    getOrganizationStub.restore()
    updateUsersForPlanStub.restore()
  })

  describe('Validation', () => {
    it('should not validate if `tid` is not a uuid', done => {
      Joi.validateAsync({ tid: 'world' }, UpdatPlanSchema)
        .asCallback(err => {
          expect(err).to.exist
          expect(err.message).to.match(/tid/i)
          done()
        })
    })

    it('should not validate if `organizationId` is not passed', done => {
      Joi.validateAsync({ tid: tid }, UpdatPlanSchema)
        .asCallback(err => {
          expect(err).to.exist
          expect(err.message).to.match(/organization/i)
          done()
        })
    })

    it('should validate if a valid job is passed', () => {
      return Joi.validateAsync(validJob, UpdatPlanSchema)
    })
  })

  describe('Errors', () => {
    it('should throw a WorkerStopError if no `stripeCustomerId` is specified in the org', done => {
      delete org.stripeCustomerId

      UpdatPlan(validJob)
        .asCallback(err => {
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err.message).to.include('stripeCustomerId')
          done()
        })
    })

    it('should throw an WorkerStopError if the organization was not found', done => {
      let thrownErr = new Error('Resource not found')
      getOrganizationStub.rejects(thrownErr)

      UpdatPlan(validJob)
        .asCallback(err => {
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err.message).to.match(/does.*not.*exist/i)
          done()
        })
    })

    it('should throw the error if the error was unexpected', done => {
      let thrownErr = new Error('some unexpected error')
      updateUsersForPlanStub.rejects(thrownErr)

      UpdatPlan(validJob)
        .asCallback(err => {
          expect(err).to.equal(thrownErr)
          done()
        })
    })
  })

  describe('Main Functionality', () => {
    it('should fetch the organization', () => {
      return UpdatPlan(validJob)
        .then(() => {
          sinon.assert.calledOnce(getOrganizationStub)
          sinon.assert.calledWithExactly(
            getOrganizationStub,
            organizationId
          )
        })
    })

    it('should update the plan', () => {
      return UpdatPlan(validJob)
        .then(() => {
          sinon.assert.calledOnce(updateUsersForPlanStub)
          sinon.assert.calledWithExactly(
            updateUsersForPlanStub,
            org
          )
        })
    })
  })
})
