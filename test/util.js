'use strict'

const Promise = require('bluebird')
const RabbitMQ = require('ponos/lib/rabbitmq')
const request = require('request-promise')
const stripe = require('util/stripe')

module.exports = class TestUtil {

  static poll (handler, interval, timeout) {
    function pollRecursive () {
      return handler()
        .then(bool => {
          if (bool) return true
          return Promise.delay(interval).then(pollRecursive)
        })
    }
    return pollRecursive()
      .timeout(timeout)
  }

  static connectToRabbitMQ (workerServer, taskNames, eventNames) {
    let allTaskNames = Array.from(workerServer._tasks.keys()) // ES6 Map
    let allEventNames = Array.from(workerServer._events.keys()) // ES6 Map
    allTaskNames = allTaskNames.concat(taskNames)
    allEventNames = allEventNames.concat(eventNames)
    let publisher = new RabbitMQ({
      name: process.env.APP_NAME,
      hostname: process.env.RABBITMQ_HOSTNAME,
      port: process.env.RABBITMQ_PORT,
      username: process.env.RABBITMQ_USERNAME,
      password: process.env.RABBITMQ_PASSWORD,
      tasks: allTaskNames,
      events: allEventNames
    })
    return publisher.connect()
      .then(() => workerServer.start())
      .return(publisher)
  }

  static disconnectToRabbitMQ (publisher, workerServer) {
    return publisher.disconnect()
      .then(() => workerServer.stop())
  }

  static getRabbitAPIRequestOpts (urlEnd, method) {
    let url = `http://${process.env.RABBITMQ_HOSTNAME}:${process.env.RABBITMQ_ADMIN_PORT}/api${urlEnd}`
    return {
      method: method || 'GET',
      uri: url,
      headers: {
        'User-Agent': 'Request-Promise'
      },
      auth: {
        user: process.env.RABBITMQ_USERNAME,
        pass: process.env.RABBITMQ_PASSWORD
      },
      json: true
    }
  }

  static deleteAllQueues () {
    return request(TestUtil.getRabbitAPIRequestOpts('/queues'))
      .then(queues => {
        queues = queues.filter(x => !!x.name)
        return Promise.map(queues, (queue) => {
          return request(TestUtil.getRabbitAPIRequestOpts(`/queues/%2f/${queue.name}`, 'DELETE'))
        })
      })
  }

  static deleteAllExchanges () {
    return request(TestUtil.getRabbitAPIRequestOpts('/exchanges'))
      .then(exchanges => {
        exchanges = exchanges.filter(x => !!x.name && !x.name.match(/^amq/))
        return Promise.map(exchanges, (exchange) => {
          return request(TestUtil.getRabbitAPIRequestOpts(`/exchanges/%2f/${exchange.name}`, 'DELETE'))
        })
      })
  }

  static deleteAllExchangesAndQueues () {
    return Promise.join(
      TestUtil.deleteAllExchanges(),
      TestUtil.deleteAllQueues()
    )
  }

  static createCustomerAndSubscription (org) {
    return stripe.stripeClient.customers.create({
      description: `Customer for organizationId: ${org.id} / githubId: ${org.githubId}`
    })
    .then(stripeCustomer => {
      org.stripeCustomerId = stripeCustomer.id
      return stripe.stripeClient.subscriptions.create({
        customer: org.stripeCustomerId,
        plan: 'runnable-starter'
      })
      .then(stripeSubscription => {
        return Promise.props({
          customer: stripeCustomer,
          subscription: stripeSubscription
        })
      })
    })
  }

  static createCustomerAndSubscriptionWithPaymentMethod (org, trialEnd, paymentMethodOwner) {
    let randomDigit = () => Math.floor(Math.random() * 10) + ''
    let securityCode = randomDigit() + randomDigit() + randomDigit()
    if (!paymentMethodOwner) {
      paymentMethodOwner = {
        id: 1, githubId: 1981198
      }
    }
    return stripe.stripeClient.tokens.create({ // Create token. Customer needs token to pay
      card: {
        number: '4242424242424242',
        exp_month: 12,
        exp_year: 2017,
        cvc: securityCode
      }
    })
    .then(token => {
      return stripe.stripeClient.customers.create({
        description: `Customer for organizationId: ${org.id} / githubId: ${org.githubId}`,
        source: token.id,
        metadata: {
          paymentMethodOwnerId: paymentMethodOwner.id,
          paymentMethodOwnerGithubId: paymentMethodOwner.githubId
        }
      })
    })
    .then(stripeCustomer => {
      org.stripeCustomerId = stripeCustomer.id
      return stripe.stripeClient.subscriptions.create({
        customer: org.stripeCustomerId,
        plan: 'runnable-starter',
        trial_end: trialEnd
      })
      .then(stripeSubscription => {
        return Promise.props({
          customer: stripeCustomer,
          subscription: stripeSubscription
        })
      })
    })
  }

  static throwIfSuccess () {
    throw new Error('Should not be called')
  }
}
