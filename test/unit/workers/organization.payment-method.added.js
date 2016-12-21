'use strict'

const Promise = require('bluebird')
const Joi = require('util/joi')
const expect = require('chai').expect
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const bigPoppa = require('util/big-poppa')
const stripe = require('util/stripe')
const rabbitmq = require('util/rabbitmq')

const PayInvoice = require('workers/organization.payment-method.added').task
const PayInvoiceSchema = require('workers/organization.payment-method.added').jobSchema

describe('#organization.payment-method.added', () => {
  let validJob
  let tid = '6ab33f93-118a-4a03-bee4-89ddebeab346'
  const organizationId = 67898
  let getOrganizationStub
  let org
  let invoice
  let getCurrentInvoiceStub
  let publishTaskStub

  beforeEach(() => {
    validJob = { organization: { id: organizationId } }
  })

  beforeEach(() => {
    org = {
      id: organizationId,
      allowed: false,
      isInGracePeriod: false,
      hasPaymentMethod: true
    }
    invoice = {
      id: 'in_asdfafasdf',
      paid: false
    }
    getOrganizationStub = sinon.stub(bigPoppa, 'getOrganization').resolves(org)
    getCurrentInvoiceStub = sinon.stub(stripe.invoices, 'getCurrentInvoice').resolves(invoice)
    publishTaskStub = sinon.stub(rabbitmq, 'publishTask')
  })

  afterEach(() => {
    getOrganizationStub.restore()
    getCurrentInvoiceStub.restore()
    publishTaskStub.restore()
  })

  describe('Validation', () => {
    it('should not validate if `organization.id` is not passed', done => {
      Joi.validateAsync({ tid: tid }, PayInvoiceSchema)
        .asCallback(err => {
          expect(err).to.exist
          expect(err.message).to.match(/organization/i)
          done()
        })
    })

    it('should validate if a valid job is passed', () => {
      return PayInvoice(validJob, PayInvoiceSchema)
    })
  })

  describe('Main Functionality', () => {
    it('should get the organization', () => {
      return PayInvoice(validJob)
        .then(() => {
          sinon.assert.calledOnce(getOrganizationStub)
          sinon.assert.calledWithExactly(
            getOrganizationStub,
            organizationId
          )
        })
    })

    it('should get the invoice', () => {
      return PayInvoice(validJob)
        .then(() => {
          sinon.assert.calledOnce(getCurrentInvoiceStub)
          sinon.assert.calledWithExactly(
            getCurrentInvoiceStub,
            org
          )
        })
    })

    it('should publish a subscription create task if the org is post grace period', () => {
      return PayInvoice(validJob)
        .then(() => {
          sinon.assert.calledOnce(publishTaskStub)
          sinon.assert.calledWithExactly(
            publishTaskStub,
            'organization.subscription.create',
            {
              organization: {
                id: organizationId
              }
            }
          )
        })
    })

    it('should publish an invoice pay task if the org is in grace period', () => {
      org.allowed = true
      org.isInGracePeriod = true
      return PayInvoice(validJob)
        .then(() => {
          sinon.assert.calledOnce(publishTaskStub)
          sinon.assert.calledWithExactly(
            publishTaskStub,
            'organization.invoice.pay',
            {
              invoice: {
                id: invoice.id
              },
              organization: {
                id: organizationId
              }
            }
          )
        })
    })

    it('should not publish any task if the org does not have a payment method', () => {
      org.hasPaymentMethod = false
      return PayInvoice(validJob)
        .then(() => {
          sinon.assert.notCalled(publishTaskStub)
        })
    })

    it('should not publish any task if the org is not in the grace period or past it', () => {
      org.allowed = true
      org.isInGracePeriod = false
      return PayInvoice(validJob)
        .then(() => {
          sinon.assert.notCalled(publishTaskStub)
        })
    })
  })
})
