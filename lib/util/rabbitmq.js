'use strict'

const RabbitMQClient = require('ponos/lib/rabbitmq')

class RabbitMQ extends RabbitMQClient {

  constructor () {
    super({
      name: process.env.APP_NAME,
      hostname: process.env.RABBITMQ_HOSTNAME,
      port: process.env.RABBITMQ_PORT,
      username: process.env.RABBITMQ_USERNAME,
      password: process.env.RABBITMQ_PASSWORD
    })
  }

  publishCheckForAlmostExpiredOrganizations () {
    return this.publishTask('organizations.plan.trial-almost-expired.check', {})
  }

  publishCheckForExpiredOrganizations () {
    return this.publishTask('organizations.plan.trial-expired.check', {})
  }

  publishCheckForOrganizationPaymentHaveFailed () {
    return this.publishTask('organizations.plan.payment-failed.check', {})
  }
}

module.exports = new RabbitMQ()
