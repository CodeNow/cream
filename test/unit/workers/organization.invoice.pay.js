'use strict'

const Promise = require('bluebird')
const Joi = require('util/joi')
const expect = require('chai').expect
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const stripe = require('util/stripe')

const PayInvoice = require('workers/organization.invoice.pay').task
const PayInvoiceSchema = require('workers/organization.invoice.pay').jobSchema

describe('#organization.invoice.pay', () => {
  const organizationId = 67898
  const invoiceId = 'in_asdfafasdf'
  const tid = '6ab33f93-118a-4a03-bee4-89ddebeab346'
  let invoice
  let validJob

  let getInvoiceStub
  let payInvoiceStub

  beforeEach(() => {
    validJob = { organization: { id: organizationId }, invoice: { id: invoiceId } }
  })

  beforeEach(() => {
    invoice = {
      id: invoiceId,
      closed: false,
      paid: false
    }
    getInvoiceStub = sinon.stub(stripe.invoices, 'get').resolves(invoice)
    payInvoiceStub = sinon.stub(stripe.invoices, 'pay').resolves()
  })

  afterEach(() => {
    getInvoiceStub.restore()
    payInvoiceStub.restore()
  })

  describe('Validation', () => {
    it('should not validate if `organization.id` is not passed', done => {
      Joi.validateAsync({ tid: tid }, PayInvoiceSchema)
        .asCallback(err => {
          expect(err).to.exist
          expect(err.message).to.match(/invoice/i)
          done()
        })
    })

    it('should validate if a valid job is passed', () => {
      return PayInvoice(validJob, PayInvoiceSchema)
    })
  })

  describe('Main Functionality', () => {
    it('should get the invoice', () => {
      return PayInvoice(validJob)
        .then(() => {
          sinon.assert.calledOnce(getInvoiceStub)
          sinon.assert.calledWithExactly(
            getInvoiceStub,
            invoiceId
          )
        })
    })

    it('should pay the invoice', () => {
      return PayInvoice(validJob)
        .then(() => {
          sinon.assert.calledOnce(payInvoiceStub)
          sinon.assert.calledWith(payInvoiceStub, invoiceId)
        })
    })

    it('should not publish the task if the invoice is paid', () => {
      invoice.closed = true
      return PayInvoice(validJob)
        .then(() => {
          sinon.assert.notCalled(payInvoiceStub)
        })
    })

    it('should not publish the task if the invoice is closed', () => {
      invoice.paid = true
      return PayInvoice(validJob)
        .then(() => {
          sinon.assert.notCalled(payInvoiceStub)
        })
    })
  })
})
