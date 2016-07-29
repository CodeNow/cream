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

  publishProcessInvoice (rawJob) {
    return Joi.validateAsync(rawJob, RabbitMQ.publishProcessInvoiceSchema, { stripUnknown: true })
      .then(job => this._rabbit.publishTask('organization.invoice.process', job))
  }

  publishInvoicePaymentSucceeded (rawJob) {
    return Joi.validateAsync(rawJob, RabbitMQ.publishInvoicePaymentSucceededSchema, { stripUnknown: true })
      .then(job => this._rabbit.publishTask('organization.invoice.payment-succeeded', job))
  }

  publishInvoicePaymentFailed (rawJob) {
    return Joi.validateAsync(rawJob, RabbitMQ.publishInvoicePaymentFailedSchema, { stripUnknown: true })
      .then(job => this._rabbit.publishTask('organization.invoice.payment-failed', job))
  }

  publishCheckForAlmostExpiredOrganizations () {
    return this._rabbit.publishTask('organization.plan.trial-almost-expired.check', {})
  }

  publishCheckForExpiredOrganizations () {
    return this._rabbit.publishTask('organization.plan.trial-expired.check', {})
  }

  publishCheckForOrganizationPaymentHaveFailed () {
    return this._rabbit.publishTask('organization.plan.payment-failed.check', {})
  }
}

RabbitMQ.publishProcessInvoiceSchema = Joi.object({
  stripeCustomerId: Joi.string().required()
})

RabbitMQ.publishInvoicePaymentSucceededSchema = Joi.object({
  stripeCustomerId: Joi.string().required()
})

RabbitMQ.publishInvoicePaymentFailedSchema = Joi.object({
  stripeCustomerId: Joi.string().required()
})

module.exports = new RabbitMQ()
