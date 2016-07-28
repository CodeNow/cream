'use strict'

const ErrorCat = require('error-cat')
const log = require('util/logger').child({ module: 'worker-server' })
const ponos = require('ponos')

/**
 * The cream ponos server.
 * @type {ponos~Server}
 * @module cream/worker
 */
module.exports = new ponos.Server({
  name: process.env.APP_NAME,
  rabbitmq: {
    channel: {
      prefetch: process.env.RABBITMQ_PREFETCH
    },
    hostname: process.env.RABBITMQ_HOSTNAME,
    port: process.env.RABBITMQ_PORT,
    username: process.env.RABBITMQ_USERNAME,
    password: process.env.RABBITMQ_PASSWORD
  },
  errorCat: ErrorCat,
  log: log,
  tasks: {
    'organization.invoice.pre-process': require('./organization.invoice.pre-process'),
    'organization.invoice.process': require('./organization.invoice.process'),
    'organization.invoice.payment-succeeded': require('./organization.invoice.payment-succeeded'),
    'organization.invoice.payment-failed': require('./organization.invoice.payment-failed'),
    'organization.user.added': require('./organization.update-users'),
    'organization.user.removed': require('./organization.update-users'),
    'organization.trial-almost-expired.check': require('./organization.trial-almost-expired.check'),
    'organization.trial-expired.check': require('./organization.trial-expired.check'),
    'organization.payment-failed.check': require('./organization.payment-failed.check'),
    'organization.almost-inactive.check': require('./organization.almost-inactive.check')
  }
})
