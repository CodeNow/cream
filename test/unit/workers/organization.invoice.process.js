'use strict'

const expect = require('chai').expect

const WorkerStopError = require('error-cat/errors/worker-stop-error')

const ProcessInvoice = require('workers/organization.invoice.process')

describe('#organization.invoice.process', () => {
  let validJob
  let tid = '6ab33f93-118a-4a03-bee4-89ddebeab346'
  let stripeCustomerId = 'cus_8tkDWhVUigbGSQ'

  beforeEach(() => {
    validJob = { stripeCustomerId: stripeCustomerId }
  })

  describe('Validation', () => {
    it('should not validate if `tid` is not a uuid', done => {
      ProcessInvoice({ tid: 'world' })
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err.message).to.match(/invalid.*job/i)
          expect(err.message).to.match(/tid/i)
          done()
        })
    })

    it('should not validate if `stripeCustomerId` is not passed', done => {
      ProcessInvoice({ tid: tid })
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err.message).to.match(/invalid.*job/i)
          expect(err.message).to.match(/stripeCustomerId/i)
          done()
        })
    })

    it('should validate if a valid job is passed', () => {
      return ProcessInvoice(validJob)
    })
  })

  xdescribe('Errors', () => {})

  xdescribe('Main Functionality', () => {})
})
