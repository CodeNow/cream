'use strict'

const RabbitMQClient = require('ponos/lib/rabbitmq')
const logger = require('util/logger').child({ module: 'util/rabbitmq' })

const schemas = require('schemas')

class RabbitMQ extends RabbitMQClient {

  constructor () {
    super({
      name: process.env.APP_NAME,
      hostname: process.env.RABBITMQ_HOSTNAME,
      port: process.env.RABBITMQ_PORT,
      username: process.env.RABBITMQ_USERNAME,
      password: process.env.RABBITMQ_PASSWORD,
      log: logger,
      tasks: [{
        name: 'organization.trial.ended.check',
        jobSchema: schemas.emptyObjectSchema
      }, {
        name: 'organization.trial.ending.check',
        jobSchema: schemas.emptyObjectSchema
      }, {
        name: 'organizations.invoice.payment-failed.check',
        jobSchema: schemas.emptyObjectSchema
      }, {
        name: 'organization.subscription.create',
        jobSchema: schemas.subscriptionCreateSchema
      }, {
        name: 'organization.invoice.pay',
        jobSchema: schemas.payInvoiceSchema
      }],
      events: [{
        name: 'organization.payment-method.added',
        jobSchema: schemas.paymentMethodEventSchema
      }, {
        name: 'organization.payment-method.removed',
        jobSchema: schemas.paymentMethodEventSchema
      }, {
        name: 'organization.trial.ending',
        jobSchema: schemas.trialSchema
      }, {
        name: 'organization.trial.ended',
        jobSchema: schemas.trialSchema
      }, {
        name: 'organization.invoice.payment-failed',
        jobSchema: schemas.invoicePaymentSchema
      }, {
        name: 'organization.subscription.created',
        jobSchema: schemas.subscriptionCreatedSchema
      }, {
        name: 'organization.allowed',
        jobSchema: schemas.organizationAllowed
      }]
    })
  }

}

module.exports = RabbitMQ
