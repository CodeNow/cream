'use strict'
const StripeError = require('errors/stripe-error')

/**
 * Error when a requested entity is not found in Stripe
 */
module.exports = class EntityExistsInStripeError extends StripeError {}
