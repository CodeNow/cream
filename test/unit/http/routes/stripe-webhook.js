'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)
const expect = require('chai').expect

const stripe = require('util/stripe')
const express = require('express')
const rabbitmq = require('util/rabbitmq')

const StripeWebhookRouter = require('http/routes/stripe-webhook')

describe('HTTP /stripe', () => {
  let responseStub

  beforeEach(() => {
    responseStub = {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis()
    }
  })

  describe('#router', () => {
    it('should return an express router', () => {
      let router = StripeWebhookRouter.router()
      expect(router).to.be.an.instanceOf(express.Router().constructor)
    })
  })

  describe('#post', () => {
    let requestMock
    let stripeEventMock
    let retrieveEventStub
    let publishInvoiceCreatedStub
    let publishInvoicePaymentSucceededStub
    let publishInvoicePaymentFailedStub
    let eventId = 'evt_18cldF2eZvKYlo2CNJnJZq2b'

    beforeEach(() => {
      requestMock = { body: { id: eventId } }
      stripeEventMock = Object.assign({}, requestMock.body)
      publishInvoiceCreatedStub = sinon.stub(rabbitmq, 'publishInvoiceCreated')
      publishInvoicePaymentSucceededStub = sinon.stub(rabbitmq, 'publishInvoicePaymentSucceeded')
      publishInvoicePaymentFailedStub = sinon.stub(rabbitmq, 'publishInvoicePaymentFailed')
      retrieveEventStub = sinon.stub(stripe.events, 'retrieve').yieldsAsync(null, stripeEventMock)
    })

    afterEach(() => {
      retrieveEventStub.restore()
      publishInvoiceCreatedStub.restore()
      publishInvoicePaymentSucceededStub.restore()
      publishInvoicePaymentFailedStub.restore()
    })

    it('should always call `events.retrieve` from the Stripe API', () => {
      return StripeWebhookRouter.post(requestMock, responseStub)
        .then(() => {
          sinon.assert.calledOnce(retrieveEventStub)
          sinon.assert.calledWithExactly(retrieveEventStub, eventId, sinon.match.func)
        })
    })

    it('should enqueue a `publishInvoiceCreated` job if a `invoice.created` event was received', () => {
      stripeEventMock.type = 'invoice.created'
      return StripeWebhookRouter.post(requestMock, responseStub)
        .then(() => {
          sinon.assert.calledOnce(publishInvoiceCreatedStub)
          sinon.assert.calledWithExactly(publishInvoiceCreatedStub, stripeEventMock)
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 200)
        })
    })

    it('should enqueue a `publishInvoicePaymentSucceeded` job if a `invoice.payment_succeeded` event was received', () => {
      stripeEventMock.type = 'invoice.payment_succeeded'
      return StripeWebhookRouter.post(requestMock, responseStub)
        .then(() => {
          sinon.assert.calledOnce(publishInvoicePaymentSucceededStub)
          sinon.assert.calledWithExactly(publishInvoicePaymentSucceededStub, stripeEventMock)
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 200)
        })
    })

    it('should enqueue a `publishInvoicePaymentFailed` job if a `invoice.payment_failed` event was received', () => {
      stripeEventMock.type = 'invoice.payment_failed'
      return StripeWebhookRouter.post(requestMock, responseStub)
        .then(() => {
          sinon.assert.calledOnce(publishInvoicePaymentFailedStub)
          sinon.assert.calledWithExactly(publishInvoicePaymentFailedStub, stripeEventMock)
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 200)
        })
    })

    it('should return a 204 if any other event is received', () => {
      stripeEventMock.type = 'account.updated'
      return StripeWebhookRouter.post(requestMock, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 204)
        })
    })
  })
})
