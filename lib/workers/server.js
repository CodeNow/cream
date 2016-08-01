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
    // Organization creation
    'organization.created': require('./organization.plan.start-trial'),
    // Users
    'organization.user.added': require('./organization.plan.update'),
    'organization.user.removed': require('./organization.plan.update'),
    // Invoices
    'organization.invoice.process': require('./organization.invoice.process'),
    'organization.invoice.payment-succeeded': require('./organization.invoice.payment-succeeded'),
    'organization.invoice.payment-failed': require('./organization.invoice.payment-failed'),
    // Instances
    'instance.container.created': require('./organization.plan.changes.check'),
    // Status checks
    'organization.plan.trial-almost-expired.check': require('./organization.plan.trial-almost-expired.check'),
    'organization.plan.trial-expired.check': require('./organization.plan.trial-expired.check'),
    'organization.invoice.payment-failed.check': require('./organization.invoice.payment-failed.check')
  }
})
