'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)
const expect = require('chai').expect

const express = require('express')

const runnableAPI = require('util/runnable-api-client')
const stripeClient = require('util/stripe/client')
const bigPoppa = require('util/big-poppa')

const HealthRouter = require('http/routes/health')

describe('HTTP /organization', () => {
  let responseStub

  beforeEach(() => {
    responseStub = {
      status: sinon.stub().returnsThis(),
      json: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis()
    }
  })

  describe('#router', () => {
    it('should return an express router', () => {
      let router = HealthRouter.router()
      expect(router).to.be.an.instanceOf(express.Router().constructor)
    })
  })

  describe('#getHealthStatus', () => {
    let checkStripeStatusStub

    beforeEach(() => {
      let isHealthy = true
      checkStripeStatusStub = sinon.stub(HealthRouter, 'checkStripeStatus').resolves({ isHealthy })
    })

    afterEach(() => {
      checkStripeStatusStub.restore()
    })

    it('should call all three status checks', () => {
      return HealthRouter.getHealthStatus({}, responseStub)
        .then(() => {
          sinon.assert.calledOnce(checkStripeStatusStub)
        })
    })

    it('should return isHealthy when checks are succseful', () => {
      return HealthRouter.getHealthStatus({}, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWith(responseStub.status, 200)
          sinon.assert.calledOnce(responseStub.json)
          sinon.assert.calledWith(responseStub.json, {
            isHealthy: true,
            services: sinon.match.any
          })
        })
    })

    it('should not return isHealthy when check are succseful', () => {
      checkStripeStatusStub.resolves({ isHealthy: false })
      return HealthRouter.getHealthStatus({}, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWith(responseStub.status, 200)
          sinon.assert.calledOnce(responseStub.json)
          sinon.assert.calledWith(responseStub.json, {
            isHealthy: false,
            services: sinon.match.any
          })
        })
    })

    it('should throw a 500 if there were any errors', () => {
      checkStripeStatusStub.rejects(new Error())
      return HealthRouter.getHealthStatus({}, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWith(responseStub.status, 500)
          sinon.assert.calledOnce(responseStub.json)
          sinon.assert.calledWith(responseStub.json, {
            err: sinon.match.any
          })
        })
    })
  })

  describe('#getServicesHealthStatus', () => {
    let checkBigPoppaStatusStub
    let checkAPIStatusStub
    let checkStripeStatusStub

    beforeEach(() => {
      let isHealthy = true
      checkBigPoppaStatusStub = sinon.stub(HealthRouter, 'checkBigPoppaStatus').resolves({ isHealthy })
      checkAPIStatusStub = sinon.stub(HealthRouter, 'checkAPIStatus').resolves({ isHealthy })
      checkStripeStatusStub = sinon.stub(HealthRouter, 'checkStripeStatus').resolves({ isHealthy })
    })

    afterEach(() => {
      checkBigPoppaStatusStub.restore()
      checkAPIStatusStub.restore()
      checkStripeStatusStub.restore()
    })

    it('should call all three status checks', () => {
      return HealthRouter.getServicesHealthStatus({}, responseStub)
        .then(() => {
          sinon.assert.calledOnce(checkBigPoppaStatusStub)
          sinon.assert.calledOnce(checkAPIStatusStub)
          sinon.assert.calledOnce(checkStripeStatusStub)
        })
    })

    it('should return isHealthy when checks are succseful', () => {
      return HealthRouter.getServicesHealthStatus({}, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWith(responseStub.status, 200)
          sinon.assert.calledOnce(responseStub.json)
          sinon.assert.calledWith(responseStub.json, {
            isHealthy: true,
            services: sinon.match.any
          })
        })
    })

    it('should not return isHealthy when check are succseful', () => {
      checkStripeStatusStub.resolves({ isHealthy: false })
      return HealthRouter.getServicesHealthStatus({}, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWith(responseStub.status, 200)
          sinon.assert.calledOnce(responseStub.json)
          sinon.assert.calledWith(responseStub.json, {
            isHealthy: false,
            services: sinon.match.any
          })
        })
    })

    it('should throw a 500 if there were any errors', () => {
      checkStripeStatusStub.rejects(new Error())
      return HealthRouter.getServicesHealthStatus({}, responseStub)
        .then(() => {
          sinon.assert.calledOnce(responseStub.status)
          sinon.assert.calledWith(responseStub.status, 500)
          sinon.assert.calledOnce(responseStub.json)
          sinon.assert.calledWith(responseStub.json, {
            err: sinon.match.any
          })
        })
    })
  })

  describe('#checkBigPoppaStatus', () => {
    let returnFailureResponseStub
    let returnSuccessResponseStub
    let getOrganizationsStub

    beforeEach(() => {
      returnFailureResponseStub = sinon.stub(HealthRouter, 'returnFailureResponse')
      returnSuccessResponseStub = sinon.stub(HealthRouter, 'returnSuccessResponse')
      getOrganizationsStub = sinon.stub(bigPoppa, 'getOrganizations').resolves([])
    })
    afterEach(() => {
      returnFailureResponseStub.restore()
      returnSuccessResponseStub.restore()
      getOrganizationsStub.restore()
    })

    it('should call big poppa', () => {
      return HealthRouter.checkBigPoppaStatus()
        .then(() => {
          sinon.assert.calledOnce(getOrganizationsStub)
        })
    })

    it('should call returnSuccessResponse if successful', () => {
      return HealthRouter.checkBigPoppaStatus()
        .then(() => {
          sinon.assert.calledOnce(returnSuccessResponseStub)
          sinon.assert.calledWithExactly(returnSuccessResponseStub, 'big-poppa')
        })
    })

    it('should call returnFailureResponse if api does not return an array', () => {
      getOrganizationsStub.resolves(null)
      return HealthRouter.checkBigPoppaStatus()
        .then(() => {
          sinon.assert.calledOnce(returnFailureResponseStub)
          sinon.assert.calledWithExactly(returnFailureResponseStub, 'big-poppa', sinon.match.any)
        })
    })

    it('should call returnFailureResponse if not successful', () => {
      const error = new Error()
      getOrganizationsStub.rejects(error)
      return HealthRouter.checkBigPoppaStatus()
        .then(() => {
          sinon.assert.calledOnce(returnFailureResponseStub)
          sinon.assert.calledWithExactly(returnFailureResponseStub, 'big-poppa', error)
        })
    })
  })

  describe('#checkStripeStatus', () => {
    let returnFailureResponseStub
    let returnSuccessResponseStub
    let listSubscriptionsStub

    beforeEach(() => {
      returnFailureResponseStub = sinon.stub(HealthRouter, 'returnFailureResponse')
      returnSuccessResponseStub = sinon.stub(HealthRouter, 'returnSuccessResponse')
      listSubscriptionsStub = sinon.stub(stripeClient.subscriptions, 'list').resolves({ data: [] })
    })
    afterEach(() => {
      returnFailureResponseStub.restore()
      returnSuccessResponseStub.restore()
      listSubscriptionsStub.restore()
    })

    it('should call stripe', () => {
      return HealthRouter.checkStripeStatus()
        .then(() => {
          sinon.assert.calledOnce(listSubscriptionsStub)
        })
    })

    it('should call returnSuccessResponse if successful', () => {
      return HealthRouter.checkStripeStatus()
        .then(() => {
          sinon.assert.calledOnce(returnSuccessResponseStub)
          sinon.assert.calledWithExactly(returnSuccessResponseStub, 'stripe')
        })
    })

    it('should call returnFailureResponse if api does not return an array', () => {
      listSubscriptionsStub.resolves({})
      return HealthRouter.checkStripeStatus()
        .then(() => {
          sinon.assert.calledOnce(returnFailureResponseStub)
          sinon.assert.calledWithExactly(returnFailureResponseStub, 'stripe', sinon.match.any)
        })
    })

    it('should call returnFailureResponse if not successful', () => {
      const error = new Error()
      listSubscriptionsStub.rejects(error)
      return HealthRouter.checkStripeStatus()
        .then(() => {
          sinon.assert.calledOnce(returnFailureResponseStub)
          sinon.assert.calledWithExactly(returnFailureResponseStub, 'stripe', error)
        })
    })
  })

  describe('#checkAPIStatus', () => {
    let returnFailureResponseStub
    let returnSuccessResponseStub
    let getAllNonTestingInstancesForUserByGithubIdStub

    beforeEach(() => {
      returnFailureResponseStub = sinon.stub(HealthRouter, 'returnFailureResponse')
      returnSuccessResponseStub = sinon.stub(HealthRouter, 'returnSuccessResponse')
      getAllNonTestingInstancesForUserByGithubIdStub = sinon.stub(runnableAPI, 'getAllNonTestingInstancesForUserByGithubId').resolves([])
    })
    afterEach(() => {
      returnFailureResponseStub.restore()
      returnSuccessResponseStub.restore()
      getAllNonTestingInstancesForUserByGithubIdStub.restore()
    })

    it('should call api', () => {
      return HealthRouter.checkAPIStatus()
        .then(() => {
          sinon.assert.calledOnce(getAllNonTestingInstancesForUserByGithubIdStub)
          sinon.assert.calledWithExactly(getAllNonTestingInstancesForUserByGithubIdStub, sinon.match.number)
        })
    })

    it('should call returnSuccessResponse if successful', () => {
      return HealthRouter.checkAPIStatus()
        .then(() => {
          sinon.assert.calledOnce(returnSuccessResponseStub)
          sinon.assert.calledWithExactly(returnSuccessResponseStub, 'runnable-api')
        })
    })

    it('should call returnFailureResponse if api does not return an array', () => {
      getAllNonTestingInstancesForUserByGithubIdStub.resolves(null)
      return HealthRouter.checkAPIStatus()
        .then(() => {
          sinon.assert.calledOnce(returnFailureResponseStub)
          sinon.assert.calledWithExactly(returnFailureResponseStub, 'runnable-api', sinon.match.any)
        })
    })

    it('should call returnFailureResponse if not successful', () => {
      const error = new Error()
      error.output = { payload: {} }
      getAllNonTestingInstancesForUserByGithubIdStub.rejects(error)
      return HealthRouter.checkAPIStatus()
        .then(() => {
          sinon.assert.calledOnce(returnFailureResponseStub)
          sinon.assert.calledWithExactly(returnFailureResponseStub, 'runnable-api', {})
        })
    })
  })

  describe('#returnSuccessResponse', () => {
    it('should return an object with the service name', () => {
      const name = 'hello'
      const response = HealthRouter.returnSuccessResponse(name)
      expect(response).to.eql({ serviceName: name, isHealthy: true })
    })
  })

  describe('#returnFailureResponse', () => {
    it('should return an object with the service name and error', () => {
      const name = 'hello'
      const response = HealthRouter.returnFailureResponse(name, {})
      expect(response).to.eql({ serviceName: name, isHealthy: false, error: {} })
    })
  })
})
