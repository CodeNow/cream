'use strict'
const Promise = require('bluebird')
// Avoiding not promisifying everywhere.
// Promisify is a global transformation. This module should be used in both
// /lib and tests.
module.exports = Promise.promisifyAll(require('joi'))
