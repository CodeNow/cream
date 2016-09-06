'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)
const expect = require('chai').expect

const WorkerStopError = require('error-cat/errors/worker-stop-error')

const stripe = require('util/stripe')
const TrialService = require('services/trial-service')
const rabbitmq = require('util/rabbitmq')

const CheckForOrganizationsWithEndingTrials = require('workers/organization.trial.ending.check')

describe('#organization.trial.ending.check', () => {
  let validJob
  let getAllOrgsInTrialByTrialEndTimeStub
  let publishEventStub
  let updateSubsriptionWithTrialEndingNotificationStub

  beforeEach('Set valid job', () => {
    validJob = {}
  })

  beforeEach('Stub out methods', () => {
    getAllOrgsInTrialByTrialEndTimeStub = sinon.stub(TrialService, 'getAllOrgsInTrialByTrialEndTime').resolves([])
    publishEventStub = sinon.stub(rabbitmq, 'publishEvent')
    updateSubsriptionWithTrialEndingNotificationStub = sinon.stub(stripe, 'updateSubsriptionWithTrialEndingNotification').resolves()
  })
  afterEach('Retore methods', () => {
    getAllOrgsInTrialByTrialEndTimeStub.restore()
    publishEventStub.restore()
    updateSubsriptionWithTrialEndingNotificationStub.restore()
  })

  describe('Validation', () => {
    it('should validate if a valid job is passed', () => {
      return CheckForOrganizationsWithEndingTrials(validJob)
    })

    it('should not validate if `tid` is not a uuid', done => {
      CheckForOrganizationsWithEndingTrials({ tid: 'world' })
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err.message).to.match(/invalid.*job/i)
          done()
        })
    })
  })

  xdescribe('Errors', () => {})

  xdescribe('Main Functionality', () => {})
})
