'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))
const sinon = require('sinon')
require('sinon-as-promised')(Promise)
const expect = require('chai').expect
const moment = require('moment')

const testUtil = require('../../util')

const stripe = require('util/stripe')
const TrialService = require('services/trial-service')
const rabbitmq = require('util/rabbitmq')

const CheckForOrganizationsWithEndedTrials = require('workers/organization.trial.ended.check').task
const CheckForOrganizationsWithEndedTrialsSchema = require('workers/organization.trial.ended.check').jobSchema

describe('#organization.trial.ended.check', () => {
  let validJob
  let getFilteredOrgsInTrialByTrialEndTimeStub
  let publishEventStub
  let updateSubscriptionWithTrialEndedNotificationStub
  let filterSpy
  const org3Id = 3
  const org3Name = 'HelloWorld'
  const org1 = {
    id: 1,
    name: 'org1',
    subscription: {
      metadata: {
        notifiedTrialEnded: moment().toISOString()
      }
    }
  }
  const org2 = {
    id: 2,
    name: 'org2'
  }
  const org3 = {
    id: org3Id,
    name: org3Name,
    subscription: {
      id: 'sub_2342323'
    }
  }

  beforeEach('Set valid job', () => {
    validJob = {}
  })

  beforeEach('Stub out methods', () => {
    getFilteredOrgsInTrialByTrialEndTimeStub = sinon.stub(TrialService, 'getFilteredOrgsInTrialByTrialEndTime').resolves([org1, org2, org3])
    publishEventStub = sinon.stub(rabbitmq, 'publishEvent')
    updateSubscriptionWithTrialEndedNotificationStub = sinon.stub(stripe, 'updateSubscriptionWithTrialEndedNotification').resolves()
    filterSpy = sinon.spy(Promise, 'filter')
  })
  afterEach('Retore methods', () => {
    getFilteredOrgsInTrialByTrialEndTimeStub.restore()
    publishEventStub.restore()
    updateSubscriptionWithTrialEndedNotificationStub.restore()
    filterSpy.restore()
  })

  describe('Validation', () => {
    it('should validate if a valid job is passed', () => {
      return Joi.validateAsync(validJob, CheckForOrganizationsWithEndedTrialsSchema)
    })

    it('should not validate if `tid` is not a uuid', done => {
      return Joi.validateAsync({ tid: 'world' }, CheckForOrganizationsWithEndedTrialsSchema)
        .asCallback(err => {
          expect(err).to.exist
          expect(err.message).to.match(/tid.*guid/i)
          done()
        })
    })
  })

  describe('Errors', () => {
    it('should throw an error if an organization cannot be updated', () => {
      let thrownErr = new Error('hello')
      getFilteredOrgsInTrialByTrialEndTimeStub.rejects(thrownErr)

      return CheckForOrganizationsWithEndedTrials(validJob)
      .then(testUtil.throwIfSuccess)
      .catch(err => {
        expect(err).to.exist
        expect(err).to.equal(thrownErr)
      })
    })

    it('should throw an error if it cant update the subscription', () => {
      let thrownErr = new Error('hello')
      const orgThatWillFail = Object.assign({}, org2, { 'subscription': { id: 'sub_23423888900' } })
      getFilteredOrgsInTrialByTrialEndTimeStub.resolves([ org1, orgThatWillFail, org3 ])
      updateSubscriptionWithTrialEndedNotificationStub.onCall(0).rejects(thrownErr)

      return CheckForOrganizationsWithEndedTrials(validJob)
      .then(testUtil.throwIfSuccess)
      .catch(err => {
        expect(err).to.exist
        expect(err).to.equal(thrownErr)
      })
    })
  })

  describe('Main Functionality', () => {
    it('should call `getFilteredOrgsInTrialByTrialEndTime`', () => {
      return CheckForOrganizationsWithEndedTrials(validJob)
      .then(() => {
        sinon.assert.calledOnce(getFilteredOrgsInTrialByTrialEndTimeStub)
        sinon.assert.calledWithExactly(
          getFilteredOrgsInTrialByTrialEndTimeStub,
          sinon.match.string
        )
      })
    })

    it('should filter out orgs with `notifiedTrialEnded`', () => {
      return CheckForOrganizationsWithEndedTrials(validJob)
      .then(() => {
        sinon.assert.calledOnce(filterSpy)
        sinon.assert.calledWithExactly(filterSpy, [org2, org3], sinon.match.func)
      })
    })

    it('should update the subscription with the `notifiedTrialEnded` property for orgs with a subscription', () => {
      return CheckForOrganizationsWithEndedTrials(validJob)
      .then(() => {
        sinon.assert.calledOnce(updateSubscriptionWithTrialEndedNotificationStub)
        sinon.assert.calledWithExactly(
          updateSubscriptionWithTrialEndedNotificationStub,
          org3.subscription.id,
          sinon.match.string
        )
      })
    })

    it('should publish a `trial.expiring` event for all unotified orgs', () => {
      return CheckForOrganizationsWithEndedTrials(validJob)
      .then(() => {
        sinon.assert.calledOnce(publishEventStub)
        sinon.assert.calledWithExactly(
          publishEventStub,
          'organization.trial.ended',
          {
            organization: {
              id: org3Id,
              name: org3Name
            }
          }
        )
      })
    })

    it('should return an array of org ids', () => {
      return CheckForOrganizationsWithEndedTrials(validJob)
      .then(orgIds => {
        expect(orgIds).to.be.an('array')
        expect(orgIds).to.have.lengthOf(1)
        expect(orgIds[0]).to.equal(org3Id)
      })
    })
  })
})
