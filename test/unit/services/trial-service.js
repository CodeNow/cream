'use strict'

const Promise = require('bluebird')
const expect = require('chai').expect
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const moment = require('moment')

const stripe = require('util/stripe')
const bigPoppa = require('util/big-poppa')
const testUtil = require('../../util')

const TrialService = require('services/trial-service')

describe('TrialService', () => {
  describe('getFilteredOrgsInTrialByTrialEndTime', () => {
    let getOrganizationsStub
    let getSubscriptionForOrganizationStub
    let filterSpy
    const endTime = moment().toISOString()
    let org1 = {
      trialEnd: moment().subtract(7, 'days'),
      stripeCustomerId: 'cus_234234'
    }
    let org2 = {
      trialEnd: moment().subtract(1, 'days'),
      stripeCustomerId: 'cus_234234'
    }
    let org3 = {
      trialEnd: moment().subtract(1, 'days'),
      stripeCustomerId: false
    }

    beforeEach('Stub out methods', () => {
      getOrganizationsStub = sinon.stub(bigPoppa, 'getOrganizations').resolves([ org1, org2, org3 ])
      getSubscriptionForOrganizationStub = sinon.stub(stripe, 'getSubscriptionForOrganization').resolves({})
      filterSpy = sinon.spy(Promise, 'filter')
    })
    afterEach('Restore stubs', () => {
      getOrganizationsStub.restore()
      getSubscriptionForOrganizationStub.restore()
      filterSpy.restore()
    })

    it('should get the organizations', () => {
      return TrialService.getFilteredOrgsInTrialByTrialEndTime(endTime)
      .then(() => {
        sinon.assert.calledOnce(getOrganizationsStub)
        sinon.assert.calledWithExactly(
          getOrganizationsStub,
          {
            hasPaymentMethod: false
          }
        )
      })
    })

    it('should filter out organizations with no `stripeCustomerId`', () => {
      return TrialService.getFilteredOrgsInTrialByTrialEndTime(endTime)
      .then(() => {
        sinon.assert.calledOnce(getOrganizationsStub)
        sinon.assert.calledWithExactly(
          getOrganizationsStub,
          {
            hasPaymentMethod: false
          }
        )
      })
    })

    it('should filter out organizations with an `endTime` after the provided time', () => {
      return TrialService.getFilteredOrgsInTrialByTrialEndTime(endTime)
      .then(() => {
        sinon.assert.calledOnce(filterSpy)
        sinon.assert.calledWithExactly(filterSpy, [org1, org2], sinon.match.func)
      })
    })

    it('should call `getSubscriptionForOrganization` for all filtered orgs', () => {
      return TrialService.getFilteredOrgsInTrialByTrialEndTime(endTime)
      .then(() => {
        sinon.assert.calledTwice(getSubscriptionForOrganizationStub)
        sinon.assert.calledWithExactly(
          getSubscriptionForOrganizationStub,
          org1.stripeCustomerId
        )
        sinon.assert.calledWithExactly(
          getSubscriptionForOrganizationStub,
          org2.stripeCustomerId
        )
      })
    })

    it('should filter out org if it has no subscription', () => {
      let thrownErr = new Error('Throw error')
      getSubscriptionForOrganizationStub.onCall(0).resolves({})
      getSubscriptionForOrganizationStub.onCall(1).rejects(thrownErr)

      return TrialService.getFilteredOrgsInTrialByTrialEndTime(endTime)
      .then(orgs => {
        expect(orgs).to.have.lengthOf(1)
        expect(orgs[0]).to.equal(org1)
      })
    })

    it('should throw an error if `getSubscriptionForOrganization` fails', () => {
      let thrownErr = new Error('Throw error')
      getOrganizationsStub.rejects(thrownErr)

      return TrialService.getFilteredOrgsInTrialByTrialEndTime(endTime)
      .then(testUtil.throwIfSuccess)
      .catch(err => {
        expect(err).to.exist
        expect(err).to.equal(thrownErr)
      })
    })
  })
})
