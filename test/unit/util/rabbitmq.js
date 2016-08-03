'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

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

  describe('#publishCheckForAlmostExpiredOrganizations', () => {
    let validJob

    beforeEach(() => {
      validJob = {}
    })

    it('should publish the task', () => {
      rabbitMQ.publishCheckForAlmostExpiredOrganizations(validJob)
      sinon.assert.calledOnce(publishTaskStub)
      sinon.assert.calledWithExactly(
        publishTaskStub,
        'organizations.plan.trial-almost-expired.check',
        validJob
      )
    })
  })

  describe('#publishCheckForExpiredOrganizations', () => {
    let validJob

    beforeEach(() => {
      validJob = {}
    })

    it('should publish the task', () => {
      rabbitMQ.publishCheckForExpiredOrganizations(validJob)
      sinon.assert.calledOnce(publishTaskStub)
      sinon.assert.calledWithExactly(
        publishTaskStub,
        'organizations.plan.trial-expired.check',
        validJob
      )
    })
  })

  describe('#publishCheckForOrganizationPaymentHaveFailed', () => {
    let validJob

    beforeEach(() => {
      validJob = {}
    })

    it('should publish the task', () => {
      rabbitMQ.publishCheckForOrganizationPaymentHaveFailed(validJob)
      sinon.assert.calledOnce(publishTaskStub)
      sinon.assert.calledWithExactly(
        publishTaskStub,
        'organizations.plan.payment-failed.check',
        validJob
      )
    })
  })
})
