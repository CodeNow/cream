'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)
const expect = require('chai').expect

const express = require('express')

const OrganizationRouter = require('http/routes/organization')

describe('HTTP /organization', () => {
  let responseStub

  beforeEach(() => {
    responseStub = {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis()
    }
  })

  describe('#router', () => {
    it('should return an express router', () => {
      let router = OrganizationRouter.router()
      expect(router).to.be.an.instanceOf(express.Router().constructor)
    })
  })

  describe('#getInvoices', () => {
    let requestStub

    beforeEach(() => {
      requestStub = { query: {} }
    })

    it('should call `status` and `send`', () => {
      return OrganizationRouter.getInvoices(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 501)
          sinon.assert.calledOnce(responseStub.send)
          sinon.assert.calledWith(responseStub.send, 'Not yet implemented')
        })
    })
  })

  describe('#getPlan', () => {
    let requestStub

    beforeEach(() => {
      requestStub = { query: {} }
    })

    it('should call `status` and `send`', () => {
      return OrganizationRouter.getPlan(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 501)
          sinon.assert.calledOnce(responseStub.send)
          sinon.assert.calledWith(responseStub.send, 'Not yet implemented')
        })
    })
  })

  describe('#getPaymentMethod', () => {
    let requestStub

    beforeEach(() => {
      requestStub = { query: {} }
    })

    it('should call `status` and `send`', () => {
      return OrganizationRouter.getPaymentMethod(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 501)
          sinon.assert.calledOnce(responseStub.send)
          sinon.assert.calledWith(responseStub.send, 'Not yet implemented')
        })
    })
  })

  describe('#postPaymentMethod', () => {
    let requestStub

    beforeEach(() => {
      requestStub = { query: {} }
    })

    it('should call `status` and `send`', () => {
      return OrganizationRouter.postPaymentMethod(requestStub, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWithExactly(responseStub.status, 501)
          sinon.assert.calledOnce(responseStub.send)
          sinon.assert.calledWith(responseStub.send, 'Not yet implemented')
        })
    })
  })
})
