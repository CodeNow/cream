'use strict'

const CriticalError = require('error-cat/errors/critical-error')
const ErrorCat = require('error-cat')
const log = require('util/logger').child({ module: 'worker-server' })
const rabbitmq = require('util/rabbitmq')
const runnableAPI = require('util/runnable-api-client')
const monitorDog = require('monitor-dog')

const server = require('workers/server')
let jobIntervals

monitorDog.startSocketsMonitor()
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
        rabbitmq.publishTask.bind(rabbitmq, 'organization.trial.ended.check', {}),
        process.env.TRIAL_ENDED_CHECK_INTERVAL
      ),
      setInterval(
        rabbitmq.publishTask.bind(rabbitmq, 'organization.trial.ending.check', {}),
        process.env.TRIAL_ENDING_CHECK_INTERVAL
      ),
      setInterval(
        rabbitmq.publishTask.bind(rabbitmq, 'organizations.plan.payment-failed.check', {}),
        process.env.PAYMENT_FAILURE_CHECK_INTERVAL
      )
    ]
  })
  .catch(err => {
    log.fatal({ err: err }, 'Worker server failed to start')
    let criticalError = new CriticalError(
      'Worker Server Failed to Start',
      { err: err }
    )
    ErrorCat.report(criticalError)
    jobIntervals.forEach(function stopAllIntervals (intervalId) {
      return clearInterval(intervalId)
    })
    throw criticalError
  })
