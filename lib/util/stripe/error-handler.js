'use strict'

const ValidationError = require('errors/validation-error')

/**
 * Cast Stripe Errors into errors we can use in our system
 *
 * @param {Object} err - Error thrown by Stripe
 * @return {void}
 * @throws {ValidationErro}
 */
module.exports = function errorHandler (err) {
  if (err.type === 'StripeCardError') {
    throw new ValidationError(`StripeCardError: ${err.message}`)
  }
  if (err.type === 'StripeInvalidRequestError') {
    throw new ValidationError(`StripeInvalidRequestError: ${err.message}`)
  }
  throw err
}
