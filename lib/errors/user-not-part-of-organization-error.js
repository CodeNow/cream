'use strict'
const ValidationError = require('./validation-error')

/**
 * Error thrown when user is not part of an organization but action requires an
 * action or modification in that organization
 */
module.exports = class UserNotPartOfOrganizationError extends ValidationError {}
