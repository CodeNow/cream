'use strict'

const RabbitMQClient = require('ponos/lib/rabbitmq')
const Joi = require('joi')
const logger = require('util/logger').child({ module: 'util/rabbitmq' })

const emptyObjectSchema = Joi.object({}).required()

const paymentMethodEventSchema = Joi.object({
  organization: Joi.object({
    name: Joi.string().required()
  }).unknown().required(),
  paymentMethodOwner: Joi.object({
    githubId: Joi.number().required()
  }).unknown().required()
}).required()

const trialSchema = Joi.object({
  organization: Joi.object({
    id: Joi.number().required(),
    name: Joi.string().required()
  }).unknown().required()
}).required().label('job')

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
      }]
    })
  }

}

module.exports = new RabbitMQ()
