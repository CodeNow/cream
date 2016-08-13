'use strict'

const WorkerStopError = require('error-cat/errors/worker-stop-error')

module.exports = function (err) {
  if (err.message.match(/resource.*not.*found/i)) {
    throw new WorkerStopError(
      'Organization with id does not exist',
      { err: err }
    )
  }
  if (err.isJoi) {
    throw new WorkerStopError(
      `Invalid Job: ${err.toString()}`,
      { err: err }
    )
  }
  throw err
}
