'use strict'
const StripeError = require('errors/stripe-error')

/**
 * Error when we get rate limited by Stripe
 */
module.exports = class RateLimitError extends StripeError {}
