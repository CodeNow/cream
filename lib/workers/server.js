'use strict'

const ErrorCat = require('error-cat')
const log = require('util/logger').child({ module: 'worker-server' })
const ponos = require('ponos')

const CreateOrganizationInStripeAndStartTrial = require('./organization.plan.start-trial')
const UpdatePlan = require('./organization.plan.update')
const ProcessInvoiceCreated = require('./stripe.invoice.created')
const ProcessPaymentSucceeded = require('./stripe.invoice.payment-succeeded')
const ProcessPaymentFailed = require('./stripe.invoice.payment-failed')
const CheckForOrganizationsWithEndedTrials = require('./organization.trial.ended.check')
const CheckForOrganizationsWithEndingTrials = require('./organization.trial.ending.check')
const CheckInvoicedPaymentFailed = require('./organizations.invoice.payment-failed.check')
const CreateNewSubscriptionForExistingOrganization = require('./organization.subscription.create')

/**
 * The cream ponos server.
 * @type {ponos~Server}
 * @module cream/worker
 */
module.exports = new ponos.Server({
  name: process.env.APP_NAME,
  enableErrorEvents: true,
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
    'organization.created': CreateOrganizationInStripeAndStartTrial,
    // Users
    'organization.user.added': UpdatePlan,
    'organization.user.removed': UpdatePlan,
    // Stripe invoice related events
    'stripe.invoice.created': ProcessInvoiceCreated,
    'stripe.invoice.payment-succeeded': ProcessPaymentSucceeded,
    'stripe.invoice.payment-failed': ProcessPaymentFailed
  },
  tasks: {
    'organization.subscription.create': CreateNewSubscriptionForExistingOrganization,
    // Status checks
    'organization.trial.ending.check': CheckForOrganizationsWithEndingTrials,
    'organization.trial.ended.check': CheckForOrganizationsWithEndedTrials,
    'organizations.invoice.payment-failed.check': CheckInvoicedPaymentFailed
  }
})
