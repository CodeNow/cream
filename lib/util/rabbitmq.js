'use strict'

const RabbitMQClient = require('ponos/lib/rabbitmq')
const Joi = require('util/joi')
const logger = require('util/logger').child({ module: 'util/rabbitmq' })

const emptyObjectSchema = Joi.object({}).required()

const organizationIdAndName = Joi.object({
  id: Joi.number().required(),
  name: Joi.string().required()
}).unknown().required()

const organizationId = Joi.object({
  id: Joi.number().required()
}).unknown().required()

const paymentMethodEventSchema = Joi.object({
  organization: organizationIdAndName,
  paymentMethodOwner: Joi.object({
    githubId: Joi.number().required(),
    email: Joi.string()
  }).unknown().required()
}).required().label('paymentMethodEventSchema')

const invoicePaymentSchema = Joi.object({
  invoicePaymentHasFailedFor24Hours: Joi.boolean().required(),
  organization: organizationIdAndName,
  paymentMethodOwner: Joi.object({
    githubId: Joi.number().required()
  }).required()
}).required().label('invoicePaymentSchema')

const trialSchema = Joi.object({
  organization: organizationIdAndName
}).required().label('trialSchema')

const subscriptionCreateSchema = Joi.object({
  organization: organizationId
}).required().label('subscriptionCreateSchema')

const subscriptionCreatedSchema = Joi.object({
  organization: organizationId,
  subscription: Joi.object({
    id: Joi.string().required()
  }).unknown().required()
}).required().label('subscriptionCreatedSchema')

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
        jobSchema: emptyObjectSchema
      }, {
        name: 'organization.trial.ending.check',
        jobSchema: emptyObjectSchema
      }, {
        name: 'organizations.invoice.payment-failed.check',
        jobSchema: emptyObjectSchema
      }, {
        name: 'organization.subscription.create',
        jobSchema: subscriptionCreateSchema
      }],
      events: [{
        name: 'organization.payment-method.added',
        jobSchema: paymentMethodEventSchema
      }, {
        name: 'organization.payment-method.removed',
        jobSchema: paymentMethodEventSchema
      }, {
        name: 'organization.trial.ending',
        jobSchema: trialSchema
      }, {
        name: 'organization.trial.ended',
        jobSchema: trialSchema
      }, {
        name: 'organization.invoice.payment-failed',
        jobSchema: invoicePaymentSchema
      }, {
        name: 'organization.subscription.created',
        jobSchema: subscriptionCreatedSchema
      }]
    })
  }

}

module.exports = new RabbitMQ()
