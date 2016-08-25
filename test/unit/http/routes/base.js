'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)
const expect = require('chai').expect

const Joi = Promise.promisifyAll(require('joi'))

const ValidationError = require('errors/validation-error')
const BaseRouter = require('http/routes/base')

describe('HTTP Base Router', () => {
  let responseStub

  beforeEach(() => {
    responseStub = {}
    responseStub.status = sinon.stub().returnsThis()
    responseStub.json = sinon.stub().resolves()
  })

  describe('#createRoute', () => {
    let schema

    beforeEach(() => {
      schema = Joi.object({})
    })

    it('should throw an error if no router is passed', () => {
      expect(() => {
        BaseRouter.createRoute(null, schema)
      }).to.throw(/router/i)
    })

    it('should throw an error if no schema is passed', () => {
      expect(() => {
        BaseRouter.createRoute(() => {}, null)
      }).to.throw(/schema/i)
    })

    it('should return a function that servers as a router', () => {
      let func = BaseRouter.createRoute(() => {}, schema)
      expect(func).to.be.a('function')
    })

    describe('Router', () => {
      let route
      let rawRequest
      let strippedRequest
      let responseStub
      let routerResponse
      let routerFunctionStub
      let validateAsyncStub
      let errorHandlerStub

      beforeEach(() => {
        rawRequest = {}
        strippedRequest = {}
        routerResponse = { a: 2 }
        validateAsyncStub = sinon.stub(Joi, 'validateAsync').resolves(strippedRequest)
        // Stub out error handler before it gets bound in `createRoute`
        errorHandlerStub = sinon.stub(BaseRouter, 'errorHandler').resolves()
        routerFunctionStub = sinon.stub().resolves(routerResponse)
        route = BaseRouter.createRoute(routerFunctionStub, schema)
      })

      afterEach(() => {
        validateAsyncStub.restore()
        errorHandlerStub.restore()
      })

      it('should validate the request against the schema', () => {
        return route(rawRequest, responseStub)
          .then(() => {
            sinon.assert.calledOnce(validateAsyncStub)
            sinon.assert.calledWithExactly(
              validateAsyncStub,
              rawRequest,
              schema,
              { stripUnknown: true }
            )
          })
      })

      it('should call the error handler if the validation fails', () => {
        let err = new Error('Validation Error')
        validateAsyncStub.rejects(err)

        return route(rawRequest, responseStub)
          .then(() => {
            sinon.assert.calledOnce(errorHandlerStub)
            sinon.assert.calledWithExactly(
              errorHandlerStub,
              responseStub,
              err
            )
          })
      })

      it('should call the router function with the request and response if the validations succeeds', () => {
        return route(rawRequest, responseStub)
          .then(() => {
            sinon.assert.calledOnce(routerFunctionStub)
            sinon.assert.calledWithExactly(
              routerFunctionStub,
              strippedRequest,
              responseStub
            )
          })
      })

      it('should call the error handler if the router function throws an error and pass the request and response', () => {
        let err = new Error('Organization Not Found')
        routerFunctionStub.rejects(err)

        return route(rawRequest, responseStub)
          .then(() => {
            sinon.assert.calledOnce(errorHandlerStub)
            sinon.assert.calledWithExactly(
              errorHandlerStub,
              responseStub,
              err
            )
          })
      })
    })
  })

  describe('#errorHandler', () => {
    it('should throw a 500 error if no error is matched', () => {
      let err = new Error('Random Error')
      BaseRouter.errorHandler(responseStub, err)
      sinon.assert.calledOnce(responseStub.status)
      sinon.assert.calledWithExactly(responseStub.status, 500)
      sinon.assert.calledOnce(responseStub.json)
      sinon.assert.calledWithExactly(
        responseStub.json,
        {
          statusCode: 500,
          message: sinon.match(/internal.*server.*error/i),
          err: err.message
        }
      )
    })

    it('should throw a 400 error if there is a Joi error', () => {
      let err = new Error('Joi Error')
      err.isJoi = true
      BaseRouter.errorHandler(responseStub, err)
      sinon.assert.calledOnce(responseStub.status)
      sinon.assert.calledWithExactly(responseStub.status, 400)
      sinon.assert.calledOnce(responseStub.json)
      sinon.assert.calledWithExactly(
        responseStub.json,
        {
          statusCode: 400,
          message: sinon.match(/validation.*error/i),
          err: err.message
        }
      )
    })
  })

  it('should throw a 400 error if there is a validation error', () => {
    let err = new ValidationError('Bad credit card')
    BaseRouter.errorHandler(responseStub, err)
    sinon.assert.calledOnce(responseStub.status)
    sinon.assert.calledWithExactly(responseStub.status, 400)
    sinon.assert.calledOnce(responseStub.json)
    sinon.assert.calledWithExactly(
      responseStub.json,
      {
        statusCode: 400,
        message: sinon.match(/validation.*error/i),
        err: err
      }
    )
  })
})
