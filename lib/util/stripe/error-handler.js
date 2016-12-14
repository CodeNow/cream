'use strict'

const monitorDog = require('monitor-dog')

const logger = require('util/logger').child({ module: 'stripe/error-handler' })
const ValidationError = require('errors/validation-error')
const RateLimitError = require('errors/rate-limit-error')

/**
 * Cast Stripe Errors into errors we can use in our system
 *
 * @param {Object} err - Error thrown by Stripe
 * @return {void}
 * @throws {ValidationErro}
 */
module.exports = function errorHandler (err) {
  const log = logger.child({ err }, 'Stripe.errorHandler')
  const errorType = err.type || 'Unhandleded'
  monitorDog.increment(`Stripe.${errorType}`, 1, {
    env: process.env.NODE_ENV
  })
  if (err.type === 'StripeCardError') {
    log.error('ValidationError')
    throw new ValidationError(`StripeCardError: ${err.message}`)
  }
  if (err.type === 'StripeInvalidRequestError') {
    log.error('ValidationError')
    throw new ValidationError(`StripeInvalidRequestError: ${err.message}`)
  }
  if (err.type === 'StripeRateLimitError') {
    log.error('RateLimitError')
    throw new RateLimitError(`StripeRateLimitError: ${err.message}`)
  }
  log.error('Unhanlded Error')
  throw err
}
