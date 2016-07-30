'use strict'

const expect = require('chai').expect

const WorkerStopError = require('error-cat/errors/worker-stop-error')

const CreateOrganizationInStripeAndStartTrial = require('workers/organization.plan.start-trial')

describe('#organization.plan.start-trial', () => {
  let validJob
  let tid = '6ab33f93-118a-4a03-bee4-89ddebeab346'
  let organizationId = 67898

  beforeEach(() => {
    validJob = { organizationId: organizationId }
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
