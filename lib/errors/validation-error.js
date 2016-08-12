'use strict'
const BaseError = require('error-cat/errors/base-error')

/**
 * Parent error for any validation errors
 */
module.exports = class ValidationError extends BaseError {}
