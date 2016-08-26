'use strict'

const Promise = require('bluebird')
const RabbitMQ = require('ponos/lib/rabbitmq')

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
}
