'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)
const expect = require('chai').expect

const Joi = require('joi')
const RabbitMQClient = require('ponos/lib/rabbitmq')
const rabbitMQInstance = require('util/rabbitmq')

describe('RabbitMQ', () => {
  let validateSpy
  let connectStub
  let disconnectStub
  let publishTaskStub
  let rabbitMQ

  beforeEach(() => {
    validateSpy = sinon.spy(Joi, 'validate')
    connectStub = sinon.stub(RabbitMQClient.prototype, 'connect').resolves()
    disconnectStub = sinon.stub(RabbitMQClient.prototype, 'disconnect').resolves()
    publishTaskStub = sinon.stub(RabbitMQClient.prototype, 'publishTask')
  })

  afterEach(() => {
    validateSpy.restore()
    connectStub.restore()
    disconnectStub.restore()
    publishTaskStub.restore()
  })

  beforeEach(() => {
    rabbitMQ = new rabbitMQInstance.constructor()
  })

  describe('constructor', () => {
    it('should have a `_rabbit` property', () => {
      expect(rabbitMQ._rabbit).to.be.an.object
      expect(rabbitMQ._rabbit.publishTask).to.be.a.function
    })
  })

  describe('connect', () => {
    it('should connect to the rabbit server', () => {
      return rabbitMQ.connect()
        .then(() => {
          sinon.assert.calledOnce(connectStub)
        })
    })

    it('should return an error if `connect` returns an error', done => {
      let originalErr = new Error('Error connecting')
      connectStub.rejects(originalErr)
      rabbitMQ.connect()
        .asCallback(err => {
          sinon.assert.calledOnce(connectStub)
          expect(err).to.exist
          expect(err).to.equal(originalErr)
          done()
        })
    })
  })

  describe('disconnect', () => {
    it('should disconnect from the rabbit server', () => {
      return rabbitMQ.disconnect()
        .then(() => {
          sinon.assert.calledOnce(disconnectStub)
        })
    })

    it('should return an error if `disconnect` returns an error', done => {
      let originalErr = new Error('Error disconnecting')
      disconnectStub.rejects(originalErr)
      rabbitMQ.disconnect()
        .asCallback(err => {
          sinon.assert.calledOnce(disconnectStub)
          expect(err).to.exist
          expect(err).to.equal(originalErr)
          done()
        })
    })
  })

  describe('publishInvoicePaymentSucceeded', () => {
    let stripeCustomerId
    let validJob

    beforeEach(() => {
      stripeCustomerId = 'cus_8tkDWhVUigbGSQ'
      validJob = { stripeCustomerId: stripeCustomerId }
    })

    describe('Validation', () => {
      it('shoud required a `githubId` property', done => {
        rabbitMQ.publishInvoicePaymentSucceeded({ notStripeCustomerId: 23423 })
          .asCallback(err => {
            expect(err).to.exist
            expect(err.message).to.match(/stripeCustomerId/i)
            done()
          })
      })

      it('shoud required the `githubId` property to be a number', done => {
        rabbitMQ.publishInvoicePaymentSucceeded({ stripeCustomerId: false })
          .asCallback(err => {
            expect(err).to.exist
            expect(err.message).to.match(/stripeCustomerId/i)
            done()
          })
      })

      it('should resolve promise if job is valid', () => {
        return rabbitMQ.publishInvoicePaymentSucceeded(validJob)
      })
    })

    it('should publish the task', () => {
      return rabbitMQ.publishInvoicePaymentSucceeded(validJob)
        .then(() => {
          sinon.assert.calledOnce(publishTaskStub)
          sinon.assert.calledWithExactly(
            publishTaskStub,
            'organization.invoice.payment-succeeded',
            validJob
          )
        })
    })
  })

  describe('publishInvoicePaymentFailed', () => {
    let stripeCustomerId
    let validJob

    beforeEach(() => {
      stripeCustomerId = 'cus_8tkDWhVUigbGSQ'
      validJob = { stripeCustomerId: stripeCustomerId }
    })

    describe('Validation', () => {
      it('shoud required a `githubId` property', done => {
        rabbitMQ.publishInvoicePaymentFailed({ notStripeCustomerId: 23423 })
          .asCallback(err => {
            expect(err).to.exist
            expect(err.message).to.match(/stripeCustomerId/i)
            done()
          })
      })

      it('shoud required the `githubId` property to be a number', done => {
        rabbitMQ.publishInvoicePaymentFailed({ stripeCustomerId: false })
          .asCallback(err => {
            expect(err).to.exist
            expect(err.message).to.match(/stripeCustomerId/i)
            done()
          })
      })

      it('should resolve promise if job is valid', () => {
        return rabbitMQ.publishInvoicePaymentFailed(validJob)
      })
    })

    it('should publish the task', () => {
      return rabbitMQ.publishInvoicePaymentFailed(validJob)
        .then(() => {
          sinon.assert.calledOnce(publishTaskStub)
          sinon.assert.calledWithExactly(
            publishTaskStub,
            'organization.invoice.payment-failed',
            validJob
          )
        })
    })
  })

  describe('publishCheckForAlmostExpiredOrganizations', () => {
    let validJob

    beforeEach(() => {
      validJob = {}
    })

    it('should publish the task', () => {
      rabbitMQ.publishCheckForAlmostExpiredOrganizations(validJob)
      sinon.assert.calledOnce(publishTaskStub)
      sinon.assert.calledWithExactly(
        publishTaskStub,
        'organization.plan.trial-almost-expired.check',
        validJob
      )
    })
  })

  describe('publishCheckForExpiredOrganizations', () => {
    let validJob

    beforeEach(() => {
      validJob = {}
    })

    it('should publish the task', () => {
      rabbitMQ.publishCheckForExpiredOrganizations(validJob)
      sinon.assert.calledOnce(publishTaskStub)
      sinon.assert.calledWithExactly(
        publishTaskStub,
        'organization.plan.trial-expired.check',
        validJob
      )
    })
  })

  describe('publishCheckForOrganizationPaymentHaveFailed', () => {
    let validJob

    beforeEach(() => {
      validJob = {}
    })

    it('should publish the task', () => {
      rabbitMQ.publishCheckForOrganizationPaymentHaveFailed(validJob)
      sinon.assert.calledOnce(publishTaskStub)
      sinon.assert.calledWithExactly(
        publishTaskStub,
        'organization.plan.payment-failed.check',
        validJob
      )
    })
  })

  describe('publishCheckForAlmostInactiveOrganizations', () => {
    let validJob

    beforeEach(() => {
      validJob = {}
    })

    it('should publish the task', () => {
      rabbitMQ.publishCheckForAlmostInactiveOrganizations(validJob)
      sinon.assert.calledOnce(publishTaskStub)
      sinon.assert.calledWithExactly(
        publishTaskStub,
        'organization.plan.almost-inactive.check',
        validJob
      )
    })
  })
})
