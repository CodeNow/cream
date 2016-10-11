'use strict'

const expect = require('chai').expect
const Joi = require('util/joi')

const EntityNotFoundError = require('errors/entity-not-found-error')
const ValidationError = require('errors/validation-error')
const WorkerStopError = require('error-cat/errors/worker-stop-error')

const errorHandler = require('workers/error-handler')

describe('error-handler', () => {
  describe('#errorHandler', () => {
    it('should throw a `WorkerStopError` when a resource is not found', () => {
      expect(() => {
        errorHandler(new Error('resource not found'))
      }).to.throw(WorkerStopError)
        .and.to.match(/does.*not.*exist/i)
    })

    it('should throw a `WorkerStopError` when a job is not validated', () => {
      const err = Joi.validate('hello', Joi.number()).error
      expect(() => {
        errorHandler(err)
      }).to.throw(WorkerStopError)
        .and.to.match(/invalid.*job/i)
    })

    it('should throw a `WorkerStopError` when a job is not validated', () => {
      const err = new ValidationError()
      expect(() => {
        errorHandler(err)
      }).to.throw(WorkerStopError)
        .and.to.match(/validation.*error/i)
    })

    it('should re-throw an unmatched error', () => {
      const originalErr = new Error()
      expect(() => {
        errorHandler(originalErr)
      }).to.throw(originalErr)
    })
  })

  describe('#entityNotFoundHandler', () => {
    it('should throw a `WorkerStopError` when a resource is not found', () => {
      const err = new EntityNotFoundError()
      expect(() => {
        errorHandler.entityNotFoundHandler(err)
      }).to.throw(WorkerStopError)
        .and.to.match(/entity.*not.*found/i)
    })

    it('should re-throw an unmatched error', () => {
      const originalErr = new Error()
      expect(() => {
        errorHandler(originalErr)
      }).to.throw(originalErr)
    })
  })
})
