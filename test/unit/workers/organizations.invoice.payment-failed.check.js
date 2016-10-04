'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)
const expect = require('chai').expect

const rabbitmq = require('util/rabbitmq')
const stripe = require('util/stripe')
const OrganizationService = require('services/organization-service')
// const WorkerStopError = require('error-cat/errors/worker-stop-error')

const CheckInvoicedPaymentFailed = require('workers/organizations.invoice.payment-failed.check').task

describe('#organizations.invoice.payment-failed.check', () => {
  let validJob
  let invoice
  let paymentMethodOwner
  const invoiceId = 'in_23423'
  let org1
  let org2
  let org3

  let getAllOrgsWithPaymentMethodInLast48HoursOfGracePeriodStub
  let getCurrentInvoiceStub
  let getCustomerPaymentMethodOwnerStub
  let publishEventStub
  let updateNotifiedAllMembersPaymentFailedStub

  beforeEach(() => {
    validJob = {}
    invoice = {
      id: invoiceId,
      attempted: true,
      paid: false,
      metadata: {
        notifiedAdminPaymentFailed: '2016-09-23T21:36:30+0000'
      }
    }
    paymentMethodOwner = {
      id: 1,
      githubId: 1981198
    }
    org1 = {
      id: 1,
      name: 'org1',
      stripeCustomerId: 'cus_1'
    }
    org2 = {
      id: 2,
      name: 'org2',
      stripeCustomerId: 'cus_2'
    }
    org3 = {
      id: 3,
      name: 'org3',
      stripeCustomerId: 'cus_3'
    }
  })

  beforeEach('Stub out methods', () => {
    getAllOrgsWithPaymentMethodInLast48HoursOfGracePeriodStub = sinon.stub(OrganizationService, 'getAllOrgsWithPaymentMethodInLast48HoursOfGracePeriod')
      .resolves([org1, org2, org3])
    getCurrentInvoiceStub = sinon.stub(stripe.invoices, 'getCurrentInvoice').resolves(invoice)
    getCustomerPaymentMethodOwnerStub = sinon.stub(stripe, 'getCustomerPaymentMethodOwner').resolves(paymentMethodOwner)
    updateNotifiedAllMembersPaymentFailedStub = sinon.stub(stripe.invoices, 'updateNotifiedAllMembersPaymentFailed').resolves()
    publishEventStub = sinon.stub(rabbitmq, 'publishEvent')
  })
  afterEach('Restore methods', () => {
    getAllOrgsWithPaymentMethodInLast48HoursOfGracePeriodStub.restore()
    getCurrentInvoiceStub.restore()
    getCustomerPaymentMethodOwnerStub.restore()
    publishEventStub.restore()
    updateNotifiedAllMembersPaymentFailedStub.restore()
  })

  describe('Errors', () => {})

  describe('Main Functionality', () => {
    it('should get the organizations', () => {
      return CheckInvoicedPaymentFailed(validJob)
      .then(() => {
        sinon.assert.calledOnce(getAllOrgsWithPaymentMethodInLast48HoursOfGracePeriodStub)
      })
    })

    it('should get the current invoice', () => {
      return CheckInvoicedPaymentFailed(validJob)
      .then(() => {
        sinon.assert.called(getCurrentInvoiceStub)
        expect(getCurrentInvoiceStub.callCount).to.equal(3)
        sinon.assert.calledWithExactly(getCurrentInvoiceStub, org1.stripeCustomerId)
        sinon.assert.calledWithExactly(getCurrentInvoiceStub, org2.stripeCustomerId)
        sinon.assert.calledWithExactly(getCurrentInvoiceStub, org3.stripeCustomerId)
      })
    })

    it('should get the customer payment method', () => {
      return CheckInvoicedPaymentFailed(validJob)
      .then(() => {
        sinon.assert.called(getCustomerPaymentMethodOwnerStub)
        expect(getCustomerPaymentMethodOwnerStub.callCount).to.equal(3)
        sinon.assert.calledWithExactly(getCustomerPaymentMethodOwnerStub, org1.stripeCustomerId)
        sinon.assert.calledWithExactly(getCustomerPaymentMethodOwnerStub, org2.stripeCustomerId)
        sinon.assert.calledWithExactly(getCustomerPaymentMethodOwnerStub, org3.stripeCustomerId)
      })
    })

    it('should update notifiedAllMembersPaymentFailed property', () => {
      return CheckInvoicedPaymentFailed(validJob)
      .then(() => {
        sinon.assert.called(updateNotifiedAllMembersPaymentFailedStub)
        expect(updateNotifiedAllMembersPaymentFailedStub.callCount).to.equal(3)
        sinon.assert.calledWithExactly(updateNotifiedAllMembersPaymentFailedStub, invoiceId, sinon.match.string)
      })
    })

    it('should publish the events', () => {
      return CheckInvoicedPaymentFailed(validJob)
      .then(() => {
        sinon.assert.called(publishEventStub)
        expect(publishEventStub.callCount).to.equal(3)
      })
    })

    it('should return the ids for orgs', () => {
      return CheckInvoicedPaymentFailed(validJob)
      .then(orgs => {
        expect(orgs).to.be.an('array')
        expect(orgs).to.have.lengthOf(3)
        expect(orgs[0].id).to.equal(org1.id)
        expect(orgs[1].id).to.equal(org2.id)
        expect(orgs[2].id).to.equal(org3.id)
      })
    })

    describe('Filtering', () => {
      it('should filter out orgs with no invoices', () => {
        getCurrentInvoiceStub.withArgs(org1.stripeCustomerId).rejects(new Error())

        return CheckInvoicedPaymentFailed(validJob)
        .then(orgs => {
          sinon.assert.called(getCurrentInvoiceStub)
          expect(getCurrentInvoiceStub.callCount).to.equal(3)
          expect(orgs).to.be.an('array')
          expect(orgs).to.have.length(2)
          expect(orgs[0].id).to.equal(org2.id)
          expect(orgs[1].id).to.equal(org3.id)
        })
      })

      describe('Invoices', () => {
        it('should filter out paid invoices', () => {
          let invoice2 = Object.assign({}, invoice, { paid: true })
          getCurrentInvoiceStub.withArgs(org1.stripeCustomerId).resolves(invoice2)

          return CheckInvoicedPaymentFailed(validJob)
          .then(orgs => {
            expect(orgs).to.be.an('array')
            expect(orgs).to.have.length(2)
            expect(orgs[0].id).to.equal(org2.id)
            expect(orgs[1].id).to.equal(org3.id)
          })
        })

        it('should filter out not attempted invoices', () => {
          let invoice2 = Object.assign({}, invoice, { attempted: false })
          getCurrentInvoiceStub.withArgs(org1.stripeCustomerId).resolves(invoice2)

          return CheckInvoicedPaymentFailed(validJob)
          .then(orgs => {
            sinon.assert.calledTwice(publishEventStub)
            expect(orgs).to.be.an('array')
            expect(orgs).to.have.length(2)
            expect(orgs[0].id).to.equal(org2.id)
            expect(orgs[1].id).to.equal(org3.id)
          })
        })

        it('should filter out orgs whos admins have not been notified', () => {
          let invoice2 = Object.assign({}, invoice, { metadata: { } })
          getCurrentInvoiceStub.withArgs(org3.stripeCustomerId).resolves(invoice2)

          return CheckInvoicedPaymentFailed(validJob)
          .then(orgs => {
            sinon.assert.calledTwice(publishEventStub)
            expect(orgs).to.be.an('array')
            expect(orgs).to.have.length(2)
            expect(orgs[0].id).to.equal(org1.id)
            expect(orgs[1].id).to.equal(org2.id)
          })
        })

        it('should filter out orgs that have already been notified', () => {
          let metadata = { notifiedAdminPaymentFailed: '2016-09-23T22:16:38+0000', notifiedAllMembersPaymentFailed: '2016-09-23T22:16:38+0000' }
          let invoice2 = Object.assign({}, invoice, { metadata })
          getCurrentInvoiceStub.withArgs(org1.stripeCustomerId).resolves(invoice2)

          return CheckInvoicedPaymentFailed(validJob)
          .then(orgs => {
            sinon.assert.calledTwice(publishEventStub)
            expect(orgs).to.be.an('array')
            expect(orgs).to.have.length(2)
            expect(orgs[0].id).to.equal(org2.id)
            expect(orgs[1].id).to.equal(org3.id)
          })
        })
      })

      it('should filter out orgs whos payment method owner could not be retrieved', () => {
        getCustomerPaymentMethodOwnerStub.withArgs(org3.stripeCustomerId).rejects(new Error())

        return CheckInvoicedPaymentFailed(validJob)
        .then(orgs => {
          sinon.assert.calledTwice(publishEventStub)
          expect(orgs).to.be.an('array')
          expect(orgs).to.have.length(2)
          expect(orgs[0].id).to.equal(org1.id)
          expect(orgs[1].id).to.equal(org2.id)
        })
      })

      it('should filter out orgs whos invoices could not be updated', () => {
        updateNotifiedAllMembersPaymentFailedStub.onCall(1).rejects(new Error())

        return CheckInvoicedPaymentFailed(validJob)
        .then(orgs => {
          sinon.assert.calledTwice(publishEventStub)
          expect(orgs).to.be.an('array')
          expect(orgs).to.have.length(2)
          expect(orgs[0].id).to.equal(org1.id)
          expect(orgs[1].id).to.equal(org3.id)
        })
      })
    })
  })
})
