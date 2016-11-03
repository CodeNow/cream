'use strict'

require('loadenv')()
const Promise = require('bluebird')

const CriticalError = require('error-cat/errors/critical-error')
const ErrorCat = require('error-cat')
const log = require('util/logger').child({ module: 'http' })
const server = require('http/server')
const rabbitmq = require('util/rabbitmq')
const runnableAPI = require('util/runnable-api-client')

process.on('unhandledRejection', function (error) {
  log.error(error, 'Unhandled promise error')
  if (error.reporting.level === 'critical') {
    throw error
  }
})

module.exports = Promise.join(
  rabbitmq.connect(),
  runnableAPI.login()
)
  .then(() => server.start())
  .then(() => {
    log.info(`HTTP server started on port ${process.env.PORT}`)
  })
  .catch((err) => {
    let msg = `${process.env.APP_NAME} HTTP Server Failed to Start`
    log.fatal({ err: err }, msg)
    let criticalError = new CriticalError(msg, { err: err })
    ErrorCat.report(criticalError)
    throw criticalError
  })
