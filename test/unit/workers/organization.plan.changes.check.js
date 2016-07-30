'use strict'

const expect = require('chai').expect

const WorkerStopError = require('error-cat/errors/worker-stop-error')

const CheckIfOrganizationPlanHasChanged = require('workers/organization.plan.changes.check')

describe('#organization.plan.changes-check', () => {
  let validJob

  beforeEach(() => {
    validJob = {}
  })

  describe('Validation', () => {
    it('should validate if a valid job is passed', () => {
      return CheckIfOrganizationPlanHasChanged(validJob)
    })

    it('should not validate if `tid` is not a uuid', done => {
      CheckIfOrganizationPlanHasChanged({ tid: 'world' })
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
