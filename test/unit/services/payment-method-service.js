'use strict'

const Promise = require('bluebird')
const expect = require('chai').expect
const sinon = require('sinon')
require('sinon-as-promised')(Promise)

const stripe = require('util/stripe')
const bigPoppa = require('util/big-poppa')
const rabbitmq = require('util/rabbitmq')
const OrganizationWithStripeCustomerIdFixture = require('../../fixtures/big-poppa/organization-with-stripe-customer-id')

const PaymentMethodService = require('services/payment-method-service')

describe('PaymentMethodService', () => {
  describe('#updatePaymentMethodForOrganization', () => {
    let getPaymentMethodForOrganizationStub
    let updatePaymentMethodForOrganizationStub
    let updateOrganizationStub
    let publishEventStub

    const orgId = 18978
    const orgName = 'CodeNow'
    const stripeToken = 'tok_23423423'
    const user1Id = 1
    const user1GithubId = 1981198
    const user2Id = 2
    const user2GithubId = 876987
    const newPaymentMethodOwnerEmail = 'jorge@runnable.com'
    let newPaymentMethodOwner
    let paymentMethod
    let org

    beforeEach('Set mocks', () => {
      newPaymentMethodOwner = {
        id: user1Id,
        githubId: user1GithubId
      }
      paymentMethod = {
        owner: {
          id: user1Id,
          githubId: user1GithubId
        }
      }
      org = {
        id: orgId,
        name: orgName
      }
    })

    beforeEach('Set stubs', () => {
      getPaymentMethodForOrganizationStub = sinon.stub(PaymentMethodService, 'getPaymentMethodForOrganization').resolves(paymentMethod)
      updatePaymentMethodForOrganizationStub = sinon.stub(stripe, 'updatePaymentMethodForOrganization')
      updateOrganizationStub = sinon.stub(bigPoppa, 'updateOrganization')
      publishEventStub = sinon.stub(rabbitmq, 'publishEvent')
    })

    afterEach('Restore stubs', () => {
      getPaymentMethodForOrganizationStub.restore()
      updatePaymentMethodForOrganizationStub.restore()
      updateOrganizationStub.restore()
      publishEventStub.restore()
    })

    it('should get the payment method for the org', () => {
      return PaymentMethodService.updatePaymentMethodForOrganization(org, stripeToken, newPaymentMethodOwner, newPaymentMethodOwnerEmail)
        .then(() => {
          sinon.assert.calledOnce(getPaymentMethodForOrganizationStub)
          sinon.assert.calledWithExactly(getPaymentMethodForOrganizationStub, org)
        })
    })

    it('should update the payment method for the organization', () => {
      return PaymentMethodService.updatePaymentMethodForOrganization(org, stripeToken, newPaymentMethodOwner, newPaymentMethodOwnerEmail)
        .then(() => {
          sinon.assert.calledOnce(updatePaymentMethodForOrganizationStub)
          sinon.assert.calledWithExactly(updatePaymentMethodForOrganizationStub, org, stripeToken, newPaymentMethodOwner, newPaymentMethodOwnerEmail)
        })
    })

    it('should update the organization in Big Poppa', () => {
      return PaymentMethodService.updatePaymentMethodForOrganization(org, stripeToken, newPaymentMethodOwner, newPaymentMethodOwnerEmail)
        .then(() => {
          sinon.assert.calledOnce(updateOrganizationStub)
          sinon.assert.calledWithExactly(updateOrganizationStub, orgId, { hasPaymentMethod: true })
        })
    })

    it('should publish an event for a payment method being added', () => {
      return PaymentMethodService.updatePaymentMethodForOrganization(org, stripeToken, newPaymentMethodOwner, newPaymentMethodOwnerEmail)
        .then(() => {
          sinon.assert.calledWithExactly(
            publishEventStub,
            'organization.payment-method.added',
            { organization: { id: org.id, name: orgName }, paymentMethodOwner: { githubId: user1GithubId, email: newPaymentMethodOwnerEmail } }
          )
        })
    })

    it('should publish an event for a payment method being removed if the owner has changed', () => {
      newPaymentMethodOwner.id = user2Id
      newPaymentMethodOwner.githubId = user2GithubId
      return PaymentMethodService.updatePaymentMethodForOrganization(org, stripeToken, newPaymentMethodOwner, newPaymentMethodOwnerEmail)
        .then(() => {
          sinon.assert.calledTwice(publishEventStub)
          sinon.assert.calledWithExactly(
            publishEventStub,
            'organization.payment-method.removed',
            { organization: { id: org.id, name: orgName }, paymentMethodOwner: { githubId: user1GithubId } }
          )
          sinon.assert.calledWithExactly(
            publishEventStub,
            'organization.payment-method.added',
            { organization: { id: org.id, name: orgName }, paymentMethodOwner: { githubId: user2GithubId, email: newPaymentMethodOwnerEmail } }
          )
        })
    })

    it('should not publish an event for a payment method being removed if the owner has not changed', () => {
      return PaymentMethodService.updatePaymentMethodForOrganization(org, stripeToken, newPaymentMethodOwner, newPaymentMethodOwnerEmail)
        .then(() => {
          sinon.assert.calledOnce(publishEventStub)
        })
    })

    it('should not publish an event for a payment method being removed if there is no payment method', () => {
      getPaymentMethodForOrganizationStub.resolves(null)

      return PaymentMethodService.updatePaymentMethodForOrganization(org, stripeToken, newPaymentMethodOwner, newPaymentMethodOwnerEmail)
        .then(() => {
          sinon.assert.calledWithExactly(updatePaymentMethodForOrganizationStub, org, stripeToken, newPaymentMethodOwner, newPaymentMethodOwnerEmail)
          sinon.assert.calledWithExactly(updateOrganizationStub, orgId, { hasPaymentMethod: true })
          sinon.assert.calledWithExactly(
            publishEventStub,
            'organization.payment-method.added',
            { organization: { id: org.id, name: orgName }, paymentMethodOwner: { githubId: user1GithubId, email: newPaymentMethodOwnerEmail } }
          )
        })
    })

    it('should return undefined', () => {
      return PaymentMethodService.updatePaymentMethodForOrganization(org, stripeToken, newPaymentMethodOwner, newPaymentMethodOwnerEmail)
        .then(res => {
          expect(res).to.equal(undefined)
        })
    })
  })

  describe('#getPaymentMethodForOrganization', () => {
    let getCustomerStub
    let org = Object.assign({}, OrganizationWithStripeCustomerIdFixture)
    let stripeCustomerId = org.stripeCustomerId
    let customer
    let paymentMethodOwnerId = 829
    let paymentMethodOwnerGithubId = 1981198
    let expMonth = 12
    let expYear = 2020
    let last4 = 7896

    beforeEach(() => {
      customer = {
        metadata: {
          paymentMethodOwnerId: paymentMethodOwnerId,
          paymentMethodOwnerGithubId: paymentMethodOwnerGithubId
        },
        sources: {
          data: [ // No reason to have
            {
              object: 'card',
              exp_month: expMonth,
              exp_year: expYear,
              last4: last4,
              brand: 'Visa'
            }
          ]
        }
      }
    })

    beforeEach('Stub out', () => {
      getCustomerStub = sinon.stub(stripe, 'getCustomer').resolves(customer)
    })
    afterEach(() => {
      getCustomerStub.restore()
    })

    it('should call `getCustomer`', () => {
      return PaymentMethodService.getPaymentMethodForOrganization(org)
        .then(() => {
          sinon.assert.calledOnce(getCustomerStub)
          sinon.assert.calledWithExactly(getCustomerStub, stripeCustomerId)
        })
    })

    it('should handle an organization not having any payment methods', () => {
      customer.sources = null
      getCustomerStub.resolves(customer)

      return PaymentMethodService.getPaymentMethodForOrganization(org)
        .then(res => {
          expect(res).to.equal(null)
        })
    })

    it('should handle an organization not having card', () => {
      customer.sources.data[0].object = 'something-else-thats-not-a-card'
      getCustomerStub.resolves(customer)

      return PaymentMethodService.getPaymentMethodForOrganization(org)
        .then(res => {
          expect(res).to.equal(null)
        })
    })

    it('should have the necessary payment method properties', () => {
      return PaymentMethodService.getPaymentMethodForOrganization(org)
        .then(res => {
          let card = res.card
          expect(card).to.have.property('expMonth', expMonth)
          expect(card).to.have.property('expYear', expYear)
          expect(card).to.have.property('last4', last4)
          expect(card).to.have.property('brand', 'Visa')
        })
    })

    it('should not get the payment method id and customer', () => {
      return PaymentMethodService.getPaymentMethodForOrganization(org)
        .then(res => {
          let card = res.card
          expect(card).to.not.have.property('id')
          expect(card).to.not.have.property('customer')
        })
    })

    it('should have the necessary user properties', () => {
      return PaymentMethodService.getPaymentMethodForOrganization(org)
        .then(res => {
          let owner = res.owner
          expect(owner).to.have.property('id', paymentMethodOwnerId)
          expect(owner).to.have.property('githubId', paymentMethodOwnerGithubId)
        })
    })
  })

  describe('#parseOwnerMetadata', () => {
    it('should return an integer of the id if it exists', () => {
      let result = PaymentMethodService.parseOwnerMetadata({ metadata: {
        paymentMethodOwnerId: '1',
        paymentMethodOwnerGithubId: '2'
      }})
      expect(result.id).to.equal(1)
      expect(result.githubId).to.equal(2)
    })

    it('should return `null` if the ids do not exist', () => {
      let result = PaymentMethodService.parseOwnerMetadata({ metadata: {
        paymentMethodOwnerId: null,
        paymentMethodOwnerGithubId: null
      }})
      expect(result.id).to.equal(null)
      expect(result.githubId).to.equal(null)
    })
  })
})
