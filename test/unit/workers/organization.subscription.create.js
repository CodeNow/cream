'use strict'

const Promise = require('bluebird')
const Joi = require('util/joi')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)
const expect = require('chai').expect

const rabbitmq = require('util/rabbitmq')
const stripe = require('util/stripe')
const bigPoppa = require('util/big-poppa')

const OrganizationsFixture = require('../../fixtures/big-poppa/organizations')

const CreateNewSubscriptionForExistingOrganization = require('workers/organization.subscription.create').task
const CreateNewSubscriptionSchema = require('workers/organization.subscription.create').jobSchema

describe('#organization.subscription.create', () => {
  let validJob
  let getOrganizationStub
  let createNewSubscriptionForCustomerWithPaymentMethodStub
  let org = OrganizationsFixture[0]
  let subscription
  let updateOrganizationStub
  let publishEventStub

  beforeEach(() => {
    validJob = { organization: { id: org.id } }
    subscription = {
      id: 'sub_9keVWtq1eYtIAt'
    }
  })

  beforeEach('Stub out', () => {
    getOrganizationStub = sinon.stub(bigPoppa, 'getOrganization').resolves(org)
    createNewSubscriptionForCustomerWithPaymentMethodStub = sinon.stub(stripe, 'createNewSubscriptionForCustomerWithPaymentMethod').resolves(subscription)
    updateOrganizationStub = sinon.stub(bigPoppa, 'updateOrganization').resolves()
    publishEventStub = sinon.stub(rabbitmq, 'publishEvent')
  })
  afterEach(() => {
    getOrganizationStub.restore()
    createNewSubscriptionForCustomerWithPaymentMethodStub.restore()
    updateOrganizationStub.restore()
    publishEventStub.restore()
  })

  describe('Validation', () => {
    it('should not validate if `organization` is not passed', done => {
      Joi.validateAsync({ tid: 'world' }, CreateNewSubscriptionSchema)
        .asCallback(err => {
          expect(err).to.exist
          expect(err.isJoi).to.equal(true)
          expect(err.message).to.match(/organization/i)
          done()
        })
    })

    it('should validate if a valid job is passed', () => {
      return Joi.validateAsync(validJob, CreateNewSubscriptionSchema)
    })
  })

  describe('Main Functionality', () => {
    it('should call `getOrganization`', () => {
      return CreateNewSubscriptionForExistingOrganization(validJob)
        .then(() => {
          sinon.assert.calledOnce(getOrganizationStub)
          sinon.assert.calledWithExactly(
            getOrganizationStub,
            org.id
          )
        })
    })

    it('should call `createNewSubscriptionForCustomerWithPaymentMethodStub`', () => {
      return CreateNewSubscriptionForExistingOrganization(validJob)
        .then(() => {
          sinon.assert.calledOnce(createNewSubscriptionForCustomerWithPaymentMethodStub)
          sinon.assert.calledWithExactly(
            createNewSubscriptionForCustomerWithPaymentMethodStub,
            org
          )
        })
    })

    it('should call `updateOrganizationStub`', () => {
      return CreateNewSubscriptionForExistingOrganization(validJob)
        .then(() => {
          sinon.assert.calledOnce(updateOrganizationStub)
          sinon.assert.calledWithExactly(
            updateOrganizationStub,
            org.id,
            {
              stripeSubscriptionId: subscription.id,
              isActive: true
            }
          )
        })
    })

    it('should publish two events', () => {
      return CreateNewSubscriptionForExistingOrganization(validJob)
        .then(() => {
          sinon.assert.calledTwice(publishEventStub)
          sinon.assert.calledWith(publishEventStub, 'organization.allowed', {
            id: org.id,
            githubId: org.githubId
          })
          sinon.assert.calledWith(publishEventStub, 'organization.subscription.created', {
            organization: {
              id: org.id
            },
            subscription: subscription
          })
        })
    })
  })
})
