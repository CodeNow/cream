'use strict'

const expect = require('chai').expect

const RateLimitError = require('errors/rate-limit-error')
const ValidationError = require('errors/validation-error')

const errorHandler = require('util/stripe/error-handler')

describe('error-handler', () => {
  describe('#errorHandler', () => {
    it('should throw a `ValidationError` when a card error is recieved', () => {
      const err = new Error('invalid CC')
      err.type = 'StripeCardError'
      expect(() => {
        errorHandler(err)
      }).to.throw(ValidationError)
    })

    it('should throw a `ValidationError` when a resource is not found', () => {
      const err = new Error('no subscription found')
      err.type = 'StripeInvalidRequestError'
      expect(() => {
        errorHandler(err)
      }).to.throw(ValidationError)
    })

    it('should throw a `ValidationError` when a resource is not found', () => {
      const err = new Error('Rate Limit Exceeded')
      err.type = 'StripeRateLimitError'
      expect(() => {
        errorHandler(err)
      }).to.throw(RateLimitError)
    })

    it('should re-throw an unmatched error', () => {
      const originalErr = new Error()
      expect(() => {
        errorHandler(originalErr)
      }).to.throw(originalErr)
    })
  })
})
