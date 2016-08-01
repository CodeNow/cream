'use strict'

const expect = require('chai').expect

const WorkerStopError = require('error-cat/errors/worker-stop-error')

const ProcessPaymentFailure = require('workers/stripe.invoice.payment-failed')

describe('#stripe.invoice.payment-failed', () => {
  let validJob
  let tid = '6ab33f93-118a-4a03-bee4-89ddebeab346'
  let stripeCustomerId = 'cus_8tkDWhVUigbGSQ'

  beforeEach(() => {
    validJob = { stripeCustomerId: stripeCustomerId }
  })

  describe('Validation', () => {
    it('should not validate if `tid` is not a uuid', done => {
      ProcessPaymentFailure({ tid: 'world' })
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err.message).to.match(/invalid.*job/i)
          expect(err.message).to.match(/tid/i)
          done()
        })
    })

    it('should not validate if `stripeCustomerId` is not passed', done => {
      ProcessPaymentFailure({ tid: tid })
        .asCallback(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err.message).to.match(/invalid.*job/i)
          expect(err.message).to.match(/stripeCustomerId/i)
          done()
        })
    })

    it('should validate if a valid job is passed', () => {
      return ProcessPaymentFailure(validJob)
    })
  })

  xdescribe('Errors', () => {})

  xdescribe('Main Functionality', () => {})
})
