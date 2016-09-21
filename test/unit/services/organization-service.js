'use strict'

const Promise = require('bluebird')
const expect = require('chai').expect
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const moment = require('moment')

const stripe = require('util/stripe')
const bigPoppa = require('util/big-poppa')
const testUtil = require('../../util')

const OrganizationService = require('services/organization-service')

describe('OrganizationService', () => {
  describe('getFilteredOrgsInTrialByTrialEndTime', () => {
    let getOrganizationsStub
    let getSubscriptionForOrganizationStub
    const endTime = moment().toISOString()
    let org1 = {
      trialEnd: moment().subtract(7, 'days'),
      stripeCustomerId: 'cus_234234'
    }
    let org2 = {
      trialEnd: moment().subtract(1, 'days'),
      stripeCustomerId: 'cus_234234'
    }

    beforeEach('Stub out methods', () => {
      getOrganizationsStub = sinon.stub(bigPoppa, 'getOrganizations').resolves([ org1, org2 ])
      getSubscriptionForOrganizationStub = sinon.stub(stripe, 'getSubscriptionForOrganization').resolves({})
    })
    afterEach('Restore stubs', () => {
      getOrganizationsStub.restore()
      getSubscriptionForOrganizationStub.restore()
    })

    it('should get the organizations', () => {
      return OrganizationService.getFilteredOrgsInTrialByTrialEndTime(endTime)
      .then(() => {
        sinon.assert.calledOnce(getOrganizationsStub)
        sinon.assert.calledWithExactly(
          getOrganizationsStub,
          {
            hasPaymentMethod: false,
            stripeCustomerId: { isNull: false },
            trialEnd: { lessThan: endTime }
          }
        )
      })
    })

    it('should call `getSubscriptionForOrganization` for all filtered orgs', () => {
      return OrganizationService.getFilteredOrgsInTrialByTrialEndTime(endTime)
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

      return OrganizationService.getFilteredOrgsInTrialByTrialEndTime(endTime)
      .then(orgs => {
        expect(orgs).to.have.lengthOf(1)
        expect(orgs[0]).to.equal(org1)
      })
    })

    it('should throw an error if `getSubscriptionForOrganization` fails', () => {
      let thrownErr = new Error('Throw error')
      getOrganizationsStub.rejects(thrownErr)

      return OrganizationService.getFilteredOrgsInTrialByTrialEndTime(endTime)
      .then(testUtil.throwIfSuccess)
      .catch(err => {
        expect(err).to.exist
        expect(err).to.equal(thrownErr)
      })
    })
  })
})
