'use strict'

const RabbitMQClient = require('ponos/lib/rabbitmq')
const Joi = require('joi')
const logger = require('util/logger').child({ module: 'util/rabbitmq' })

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
        name: 'organizations.plan.trial-almost-expired.check',
        jobSchema: Joi.object({}).required()
      }, {
        name: 'organizations.plan.trial-expired.check',
        jobSchema: Joi.object({}).required()
      }, {
        name: 'organizations.plan.payment-failed.check',
        jobSchema: Joi.object({}).required()
      }]
    })
  }

}

module.exports = new RabbitMQ()
