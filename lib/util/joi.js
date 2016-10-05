'use strict'
const Promise = require('bluebird')
// Avoiding not promisifying somewhere
// https://github.com/CodeNow/cream/pull/40/files
module.exports = Promise.promisifyAll(require('joi'))
