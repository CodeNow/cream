'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))
const expect = require('chai').expect
const sinon = require('sinon')
const testUtil = require('../../util')
require('sinon-as-promised')(Promise)

const moment = require('moment')
const stripe = require('util/stripe')
const bigPoppa = require('util/big-poppa')
const rabbitmq = require('util/rabbitmq')

const EntityNotFoundError = require('errors/entity-not-found-error')
const WorkerStopError = require('error-cat/errors/worker-stop-error')
const OrganizationsFixture = require('../../fixtures/big-poppa/organizations')

const ProcessPaymentFailure = require('workers/stripe.invoice.payment-failed').task
const ProcessPaymentFailureSchema = require('workers/stripe.invoice.payment-failed').jobSchema

// Add `hasPaymentMethod` property
OrganizationsFixture.map(org => Object.assign(org, { hasPaymentMethod: true }))

describe('#stripe.invoice.payment-failed', () => {
  // Stubs
  let getEventStub
  let getInvoiceStub
  let getOrganizationsStub
  let getCustomerPaymentMethodOwnerStub
  let updateNotifiedAdminPaymentFailedStub
  let publishEventStub

  // Data
  let validJob
  const orgId = OrganizationsFixture[0].id
  const orgName = OrganizationsFixture[0].name
  const tid = '6ab33f93-118a-4a03-bee4-89ddebeab346'
  const stripeEventId = 'evt_8tkDWhVUigbGSQ'
  const paymentMethodOwnerId = 6
  const paymentMethodOwnerGithubId = 1981198
  const stripeCustomerId = OrganizationsFixture[0].stripeCustomerId
  const invoiceId = 'in_18u3k8LYrJgOrBWzOk9UHlFT'
  let paymentMethodOwner

  beforeEach(() => {
    validJob = { stripeEventId }
    stripeEvent = {
      id: 'evt_18u4guLYrJgOrBWztQr09Xnx',
      type: 'invoice.payment_failed',
      data: {
        object: {
          object: 'invoice',
          id: invoiceId,
          customer: stripeCustomerId
        }
      }
    }
    stripeInvoice = {
      metadata: {}
    }
    paymentMethodOwner = {
      id: paymentMethodOwnerId,
      githubId: paymentMethodOwnerGithubId
    }
  })

  let stripeEvent
  let stripeInvoice

  beforeEach('Stub out methods', () => {
    getEventStub = sinon.stub(stripe, 'getEvent').resolves(stripeEvent)
    getInvoiceStub = sinon.stub(stripe.invoices, 'get').resolves(stripeInvoice)
    getOrganizationsStub = sinon.stub(bigPoppa, 'getOrganizations').resolves(OrganizationsFixture)
    getCustomerPaymentMethodOwnerStub = sinon.stub(stripe, 'getCustomerPaymentMethodOwner').resolves(paymentMethodOwner)
    updateNotifiedAdminPaymentFailedStub = sinon.stub(stripe.invoices, 'updateNotifiedAdminPaymentFailed').resolves({})
    publishEventStub = sinon.stub(rabbitmq, 'publishEvent')
  })
  afterEach('Restore methods', () => {
    getEventStub.restore()
    getInvoiceStub.restore()
    getOrganizationsStub.restore()
    getCustomerPaymentMethodOwnerStub.restore()
    updateNotifiedAdminPaymentFailedStub.restore()
    publishEventStub.restore()
  })

  describe('Validation', () => {
    it('should not validate if `tid` is not a uuid', () => {
      return Joi.validateAsync({ tid: 'world' }, ProcessPaymentFailureSchema)
        .then(testUtil.throwIfSuccess)
        .catch(err => {
          expect(err).to.exist
          expect(err.message).to.match(/tid/i)
        })
    })

    it('should not validate if `stripeCustomerId` is not passed', () => {
      return Joi.validateAsync({ tid: tid }, ProcessPaymentFailureSchema)
        .then(testUtil.throwIfSuccess)
        .catch(err => {
          expect(err).to.exist
          expect(err.message).to.match(/stripeEventId/i)
        })
    })

    it('should validate if a valid job is passed', () => {
      return Joi.validateAsync(validJob, ProcessPaymentFailureSchema)
    })
  })

  describe('Errors', () => {
    it('should throw a `WorkerStopError` if no invoice is found', () => {
      let org = Object.assign({}, OrganizationsFixture[0], { hasPaymentMethod: false })
      getOrganizationsStub.resolves([ org ])

      return ProcessPaymentFailure(validJob)
        .then(testUtil.throwIfSuccess)
        .catch(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err).to.match(/organization.*payment.*method/i)
        })
    })

    it('should throw a `WorkerStopError` if no invoice is found', () => {
      getInvoiceStub.rejects(new EntityNotFoundError('no invoice found'))

      return ProcessPaymentFailure(validJob)
        .then(testUtil.throwIfSuccess)
        .catch(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err).to.match(/no.*invoice.*found/i)
        })
    })

    it('should throw a `WorkerStopError` if no invoice is found', () => {
      stripeInvoice.metadata.notifiedAdminPaymentFailed = moment().toISOString()

      return ProcessPaymentFailure(validJob)
        .then(testUtil.throwIfSuccess)
        .catch(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err).to.match(/has.*been.*notified/i)
        })
    })

    it('should throw a `WorkerStopError` if no orgs are found', () => {
      getOrganizationsStub.resolves([])

      return ProcessPaymentFailure(validJob)
        .then(testUtil.throwIfSuccess)
        .catch(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err).to.match(/stripeCustomerId/i)
        })
    })

    it('should throw a `WorkerStopError` if no paymentMethodOwner is found', () => {
      getCustomerPaymentMethodOwnerStub.rejects(new EntityNotFoundError('No paymentMethodOwner found for this org'))

      return ProcessPaymentFailure(validJob)
        .then(testUtil.throwIfSuccess)
        .catch(err => {
          expect(err).to.exist
          expect(err).to.be.an.instanceof(WorkerStopError)
          expect(err).to.match(/no.*paymentmethodowner.*found/i)
        })
    })

    it('should throw any unhandled errors', () => {
      let thrownErr = new Error()
      getOrganizationsStub.rejects(thrownErr)

      return ProcessPaymentFailure(validJob)
        .then(testUtil.throwIfSuccess)
        .catch(err => {
          expect(err).to.exist
          expect(err).to.equal(thrownErr)
        })
    })
  })

  describe('Main Functionality', () => {
    it('should get the invoice', () => {
      return ProcessPaymentFailure(validJob)
        .then(() => {
          sinon.assert.calledOnce(getInvoiceStub)
          sinon.assert.calledWithExactly(getInvoiceStub, invoiceId)
        })
    })

    it('should get the organization', () => {
      return ProcessPaymentFailure(validJob)
        .then(() => {
          sinon.assert.calledOnce(getOrganizationsStub)
          sinon.assert.calledWithExactly(getOrganizationsStub, { stripeCustomerId })
        })
    })

    it('should get the customer payment method', () => {
      return ProcessPaymentFailure(validJob)
        .then(() => {
          sinon.assert.calledOnce(getCustomerPaymentMethodOwnerStub)
          sinon.assert.calledWithExactly(getCustomerPaymentMethodOwnerStub, stripeCustomerId)
        })
    })

    it('should update the invoice', () => {
      return ProcessPaymentFailure(validJob)
        .then(() => {
          sinon.assert.calledOnce(updateNotifiedAdminPaymentFailedStub)
          sinon.assert.calledWithExactly(
            updateNotifiedAdminPaymentFailedStub,
            invoiceId,
            paymentMethodOwnerId,
            sinon.match.string
          )
        })
    })

    it('should publish the event', () => {
      return ProcessPaymentFailure(validJob)
        .then(() => {
          sinon.assert.calledOnce(publishEventStub)
          sinon.assert.calledWithExactly(
            publishEventStub,
            'organization.invoice.payment-failed',
            {
              invoicePaymentHasFailedFor24Hours: false,
              organization: {
                id: orgId,
                name: orgName
              },
              paymentMethodOwner: {
                githubId: paymentMethodOwnerGithubId
              }
            }
          )
        })
    })
  })
})
