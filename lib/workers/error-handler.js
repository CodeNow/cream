'use strict'

const EntityNotFoundError = require('errors/entity-not-found-error')
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

module.exports.entityNotFoundHandler = function (err) {
  if (err instanceof EntityNotFoundError) {
    throw new WorkerStopError(`The requested entity was not found: ${err.toString()}`, { err })
  }
  throw err
}
