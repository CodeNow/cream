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

  static createCustomerAndSubscription (org, opts) {
    if (!opts) opts = {}
    return stripe.stripeClient.customers.create({
      description: `Customer for organizationId: ${org.id} / githubId: ${org.githubId}`
    })
    .then(stripeCustomer => {
      org.stripeCustomerId = stripeCustomer.id
      const updates = {
        customer: org.stripeCustomerId,
        plan: 'runnable-starter'
      }
      if (opts.trialEnd) {
        updates.trial_end = opts.trialEnd
      }
      return stripe.stripeClient.subscriptions.create(updates)
      .then(stripeSubscription => {
        org.stripeSubscriptionId = stripeSubscription.id
        return Promise.props({
          customer: stripeCustomer,
          subscription: stripeSubscription
        })
      })
      .catch(console.log)
    })
  }

  static createCustomerAndSubscriptionWithPaymentMethod (org, opts) {
    if (!opts) opts = {}
    let randomDigit = () => Math.floor(Math.random() * 10) + ''
    let securityCode = randomDigit() + randomDigit() + randomDigit()
    let creditCardNumber = '4242424242424242'
    if (!opts.paymentMethodOwner) {
      opts.paymentMethodOwner = {
        id: 1, githubId: 1981198
      }
    }
    if (opts.useFailingCard) {
      creditCardNumber = '4000000000000341' // Attaching this card to a Customer object will succeed, but attempts to charge the customer will fail.
    }

    return stripe.stripeClient.tokens.create({ // Create token. Customer needs token to pay
      card: {
        number: creditCardNumber,
        exp_month: 12,
        exp_year: 2020,
        cvc: securityCode
      }
    })
    .then(stripeToken => {
      return stripe.stripeClient.customers.create({
        description: `Customer for organizationId: ${org.id} / githubId: ${org.githubId}`,
        source: stripeToken.id,
        coupon: opts.coupon,
        metadata: {
          paymentMethodOwnerId: opts.paymentMethodOwner.id,
          paymentMethodOwnerGithubId: opts.paymentMethodOwner.githubId
        }
      })
      .then(stripeCustomer => [stripeCustomer, stripeToken])
    })
    .spread((stripeCustomer, stripeToken) => {
      org.stripeCustomerId = stripeCustomer.id
      return stripe.stripeClient.subscriptions.create({
        customer: org.stripeCustomerId,
        plan: opts.plan || 'runnable-starter',
        trial_end: opts.trialEnd || 'now',
        metadata: {
          users: JSON.stringify(opts.users || [])
        }
      })
      .then(stripeSubscription => {
        org.stripeSubscriptionId = stripeSubscription.id
        return Promise.props({
          customer: stripeCustomer,
          subscription: stripeSubscription,
          token: stripeToken
        })
      })
    })
  }

  static throwIfSuccess () {
    throw new Error('Should not be called')
  }
}
