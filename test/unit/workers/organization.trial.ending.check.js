'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))
const sinon = require('sinon')
require('sinon-as-promised')(Promise)
const expect = require('chai').expect

const stripe = require('util/stripe')
const TrialService = require('services/trial-service')
const rabbitmq = require('util/rabbitmq')

const CheckForOrganizationsWithEndingTrialsSchema = require('workers/organization.trial.ending.check').jobSchema

describe('#organization.trial.ending.check', () => {
  let validJob
  let getFilteredOrgsInTrialByTrialEndTimeStub
  let publishEventStub
  let updateSubsriptionWithTrialEndingNotificationStub

  beforeEach('Set valid job', () => {
    validJob = {}
  })

  beforeEach('Stub out methods', () => {
    getFilteredOrgsInTrialByTrialEndTimeStub = sinon.stub(TrialService, 'getFilteredOrgsInTrialByTrialEndTime').resolves([])
    publishEventStub = sinon.stub(rabbitmq, 'publishEvent')
    updateSubsriptionWithTrialEndingNotificationStub = sinon.stub(stripe, 'updateSubsriptionWithTrialEndingNotification').resolves()
  })
  afterEach('Retore methods', () => {
    getFilteredOrgsInTrialByTrialEndTimeStub.restore()
    publishEventStub.restore()
    updateSubsriptionWithTrialEndingNotificationStub.restore()
  })

  describe('Validation', () => {
    it('should validate if a valid job is passed', () => {
      return Joi.validateAsync(validJob, CheckForOrganizationsWithEndingTrialsSchema)
    })

    it('should not validate if `tid` is not a uuid', done => {
      return Joi.validateAsync({ tid: 'world' }, CheckForOrganizationsWithEndingTrialsSchema)
        .asCallback(err => {
          expect(err).to.exist
          expect(err.message).to.match(/tid.*guid/i)
          done()
        })
    })
  })

  xdescribe('Errors', () => {})

  xdescribe('Main Functionality', () => {})
})
