'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)
const expect = require('chai').expect
const moment = require('moment')

const testUtil = require('../../util')

const stripe = require('util/stripe')
const TrialService = require('services/trial-service')
const rabbitmq = require('util/rabbitmq')

const CheckForOrganizationsWithEndingTrials = require('workers/organization.trial.ending.check').task

describe('#organization.trial.ending.check', () => {
  let validJob
  let getFilteredOrgsInTrialByTrialEndTimeStub
  let publishEventStub
  let updateSubscriptionWithTrialEndingNotificationStub
  let filterSpy
  const org3Id = 3
  const org3Name = 'HelloWorld'
  const org1 = {
    id: 1,
    name: 'org1',
    subscription: {
      metadata: {
        notifiedTrialEnding: moment().toISOString()
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
    updateSubscriptionWithTrialEndingNotificationStub = sinon.stub(stripe, 'updateSubscriptionWithTrialEndingNotification').resolves()
    filterSpy = sinon.spy(Promise, 'filter')
  })
  afterEach('Retore methods', () => {
    getFilteredOrgsInTrialByTrialEndTimeStub.restore()
    publishEventStub.restore()
    updateSubscriptionWithTrialEndingNotificationStub.restore()
    filterSpy.restore()
  })

  describe('Errors', () => {
    it('should throw an error if an organization cannot be updated', () => {
      let thrownErr = new Error('hello')
      getFilteredOrgsInTrialByTrialEndTimeStub.rejects(thrownErr)

      return CheckForOrganizationsWithEndingTrials(validJob)
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
      updateSubscriptionWithTrialEndingNotificationStub.onCall(0).rejects(thrownErr)

      return CheckForOrganizationsWithEndingTrials(validJob)
      .then(testUtil.throwIfSuccess)
      .catch(err => {
        expect(err).to.exist
        expect(err).to.equal(thrownErr)
      })
    })
  })

  describe('Main Functionality', () => {
    it('should call `getFilteredOrgsInTrialByTrialEndTime`', () => {
      return CheckForOrganizationsWithEndingTrials(validJob)
      .then(() => {
        sinon.assert.calledOnce(getFilteredOrgsInTrialByTrialEndTimeStub)
        sinon.assert.calledWithExactly(
          getFilteredOrgsInTrialByTrialEndTimeStub,
          sinon.match.string
        )
      })
    })

    it('should filter out orgs with `notifiedTrialEnding`', () => {
      return CheckForOrganizationsWithEndingTrials(validJob)
      .then(() => {
        sinon.assert.calledOnce(filterSpy)
        sinon.assert.calledWithExactly(filterSpy, [org2, org3], sinon.match.func)
      })
    })

    it('should update the subscription with the `notifiedTrialEnding` property for orgs with a subscription', () => {
      return CheckForOrganizationsWithEndingTrials(validJob)
      .then(() => {
        sinon.assert.calledOnce(updateSubscriptionWithTrialEndingNotificationStub)
        sinon.assert.calledWithExactly(
          updateSubscriptionWithTrialEndingNotificationStub,
          org3.subscription.id,
          sinon.match.string
        )
      })
    })

    it('should publish a `trial.expiring` event for all unotified orgs', () => {
      return CheckForOrganizationsWithEndingTrials(validJob)
      .then(() => {
        sinon.assert.calledOnce(publishEventStub)
        sinon.assert.calledWithExactly(
          publishEventStub,
          'organization.trial.ending',
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
      return CheckForOrganizationsWithEndingTrials(validJob)
      .then(orgIds => {
        expect(orgIds).to.be.an('array')
        expect(orgIds).to.have.lengthOf(1)
        expect(orgIds[0]).to.equal(org3Id)
      })
    })
  })
})
