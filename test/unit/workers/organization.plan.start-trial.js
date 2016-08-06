'use strict'

const Promise = require('bluebird')
const expect = require('chai').expect
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const bigPoppa = require('util/big-poppa')
const stripe = require('util/stripe')

const WorkerStopError = require('error-cat/errors/worker-stop-error')

const CreateOrganizationInStripeAndStartTrial = require('workers/organization.plan.start-trial')

describe('#organization.plan.start-trial', () => {
  let validJob
  let tid = '6ab33f93-118a-4a03-bee4-89ddebeab346'
  let organizationId = 67898
  let getOrganizationStub
  let updateOrganizationStub
  let createCustomerStub

  beforeEach(() => {
    validJob = { organizationId: organizationId }
  })

  beforeEach(() => {
    getOrganizationStub = sinon.stub(bigPoppa, 'getOrganization').resolves({ id: 2 })
    updateOrganizationStub = sinon.stub(bigPoppa, 'updateOrganization').resolves({})
    createCustomerStub = sinon.stub(stripe, 'createCustomerAndSubscriptionForOrganization').resolves({
      customer: {},
      subscription: {
        trial_end: '234'
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

    it('should not validate if `organizationId` is not passed', done => {
      CreateOrganizationInStripeAndStartTrial({ tid: tid })
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err.message).to.match(/invalid.*job/i)
          expect(err.message).to.match(/organizationId/i)
          done()
        })
    })

    it('should validate if a valid job is passed', () => {
      return CreateOrganizationInStripeAndStartTrial(validJob)
    })
  })

  xdescribe('Errors', () => {})

  xdescribe('Main Functionality', () => {})
})
