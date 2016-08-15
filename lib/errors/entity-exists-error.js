'use strict'
const StripeError = require('errors/stripe-error')

/**
 * Error when attempting to create any entity that already exist in Stripe
 */
module.exports = class EntityExistsInStripeError extends StripeError {}
