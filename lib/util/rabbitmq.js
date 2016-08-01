'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))

const RabbitMQClient = require('ponos/lib/rabbitmq')

class RabbitMQ {

  constructor () {
    this._rabbit = new RabbitMQClient({
      name: process.env.APP_NAME,
      hostname: process.env.RABBITMQ_HOSTNAME,
      port: process.env.RABBITMQ_PORT,
      username: process.env.RABBITMQ_USERNAME,
      password: process.env.RABBITMQ_PASSWORD
    })
  }

  connect () {
    return this._rabbit.connect()
  }

  disconnect () {
    return this._rabbit.disconnect()
  }

  publishInvoiceCreated (rawJob) {
    return Joi.validateAsync(rawJob, RabbitMQ.publishInvoiceCreatedSchema, { stripUnknown: true })
      .then(job => this._rabbit.publishTask('stripe.invoice.created', job))
  }

  publishInvoicePaymentSucceeded (rawJob) {
    return Joi.validateAsync(rawJob, RabbitMQ.publishInvoicePaymentSucceededSchema, { stripUnknown: true })
      .then(job => this._rabbit.publishTask('stripe.invoice.payment-succeeded', job))
  }

  publishInvoicePaymentFailed (rawJob) {
    return Joi.validateAsync(rawJob, RabbitMQ.publishInvoicePaymentFailedSchema, { stripUnknown: true })
      .then(job => this._rabbit.publishTask('stripe.invoice.payment-failed', job))
  }

  publishCheckForAlmostExpiredOrganizations () {
    return this._rabbit.publishTask('organizations.plan.trial-almost-expired.check', {})
  }

  publishCheckForExpiredOrganizations () {
    return this._rabbit.publishTask('organizations.plan.trial-expired.check', {})
  }

  publishCheckForOrganizationPaymentHaveFailed () {
    return this._rabbit.publishTask('organizations.plan.payment-failed.check', {})
  }
}

RabbitMQ.publishInvoiceCreatedSchema = Joi.object({
  stripeCustomerId: Joi.string().required()
}).required()

RabbitMQ.publishInvoicePaymentSucceededSchema = Joi.object({
  stripeCustomerId: Joi.string().required()
}).required()

RabbitMQ.publishInvoicePaymentFailedSchema = Joi.object({
  stripeCustomerId: Joi.string().required()
}).required()

module.exports = new RabbitMQ()
