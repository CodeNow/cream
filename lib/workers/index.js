'use strict'

const CriticalError = require('error-cat/errors/critical-error')
const ErrorCat = require('error-cat')
const log = require('util/logger').child({ module: 'worker-server' })
const rabbitmq = require('util/rabbitmq')
const runnableAPI = require('util/runnable-api-client')

const server = require('workers/server')
let jobIntervals

Promise.all([
  rabbitmq.connect(),
  runnableAPI.login()
])
  .then(() => server.start())
  .then(() => {
    log.info('Worker Server Started')
    // Create all intervals for recurring jobs
    jobIntervals = [
      setInterval(
        rabbitmq.publishTask.bind(rabbitmq, 'organizations.plan.trial-almost-expired.check', {}),
        process.env.TRIAL_ALMOST_EXPIRED_CHECK_INTERVAL
      ),
      setInterval(
        rabbitmq.publishTask.bind(rabbitmq, 'organizations.plan.trial-expired.check', {}),
        process.env.TRIAL_EXPIRATION_CHECK_INTERVAL
      ),
      setInterval(
        rabbitmq.publishTask.bind(rabbitmq, 'organizations.plan.payment-failed.check', {}),
        process.env.PAYMENT_FAILURE_CHECK_INTERVAL
      )
    ]
  })
  .catch(err => {
    log.fatal({ err: err }, 'Worker server failed to start')
    ErrorCat.report(new CriticalError(
      'Worker Server Failed to Start',
      { err: err }
    ))
    jobIntervals.forEach(function stopAllIntervals (intervalId) {
      return clearInterval(intervalId)
    })
    process.exit(1)
  })
