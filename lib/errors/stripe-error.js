'use strict'
const BaseError = require('error-cat/errors/base-error')

/**
 * Parent error for any Stripe related errors
 */
module.exports = class StripeError extends BaseError {}
