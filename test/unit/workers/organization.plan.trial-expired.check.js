'use strict'

const expect = require('chai').expect

const WorkerStopError = require('error-cat/errors/worker-stop-error')

const CheckForOrganizationsWithExpiredTrials = require('workers/organization.plan.trial-expired.check')

describe('#organization.plan.trial-expired.check', () => {
  let validJob

  beforeEach(() => {
    validJob = {}
  })

  describe('Validation', () => {
    it('should validate if a valid job is passed', () => {
      return CheckForOrganizationsWithExpiredTrials(validJob)
    })

    it('should not validate if `tid` is not a uuid', done => {
      CheckForOrganizationsWithExpiredTrials({ tid: 'world' })
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
