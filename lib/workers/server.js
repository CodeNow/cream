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
  events: {
    // Organization creation
    'organization.created': require('./organization.plan.start-trial'),
    // Users
    'organization.user.added': require('./organization.plan.update'),
    'organization.user.removed': require('./organization.plan.update'),
    // Instances
    'instance.container.created': require('./organization.plan.changes.check'),
    // Stripe invoice related events
    'stripe.invoice.created': require('./stripe.invoice.created'),
    'stripe.invoice.payment-succeeded': require('./stripe.invoice.payment-succeeded'),
    'stripe.invoice.payment-failed': require('./stripe.invoice.payment-failed')
  },
  tasks: {
    // Status checks
    'organizations.plan.trial-almost-expired.check': require('./organizations.plan.trial-almost-expired.check'),
    'organizations.plan.trial-expired.check': require('./organizations.plan.trial-expired.check'),
    'organizations.invoice.payment-failed.check': require('./organizations.invoice.payment-failed.check')
  }
})
