'use strict'

require('loadenv')()

const CriticalError = require('error-cat/errors/critical-error')
const ErrorCat = require('error-cat')
const log = require('util/logger').child({ module: 'http' })
const server = require('http/server')
const rabbitmq = require('util/rabbitmq')
const runnableClient = require('util/runnable-api-client')

server.start()
  .then(() => {
    log.info(`HTTP server started on port ${process.env.PORT}`)
    return Promise.all([
      rabbitmq.connect(),
      runnableClient.login()
    ])
  })
  .catch((err) => {
    log.fatal({ err: err }, `${process.env.APP_NAME} HTTP Server Failed to Start`)
    ErrorCat.report(new CriticalError(
      `${process.env.APP_NAME} HTTP Server Failed to Start`,
      { err: err }
    ))
    process.exit(1)
  })
