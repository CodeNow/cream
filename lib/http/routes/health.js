'use strict'

const Promise = require('bluebird')
const express = require('express')
const Joi = require('util/joi')

const logger = require('util/logger').child({ module: 'OrganizationRouter' })
const stripeClient = require('util/stripe/client')
const runnableAPI = require('util/runnable-api-client')
const RabbitMQ = require('util/rabbitmq')
const bigPoppa = require('util/big-poppa')

const BaseRouter = require('http/routes/base')

class HealthRouter extends BaseRouter {

  /**
   * Generate an express router based on the router class
   *
   * @returns {Object} - An newly generated express router
   */
  static router () {
    const router = express.Router()
    router.get('/', HealthRouter.createRoute(HealthRouter.getHealthStatus, HealthRouter.getSchema))
    router.get('/services', HealthRouter.createRoute(HealthRouter.getServicesHealthStatus, HealthRouter.getSchema))
    return router
  }

  /**
   * Get the status for health status
   *
   * Things tested by route
   * - Stripe status
   * - RabbitMQ status
   *
   * @param {Object} validatedReq - Validated request against `getSchema`
   * @return {Promise}
   * @resolves {Object}
   */
  static getHealthStatus (validatedReq, res) {
    const log = logger.child({ validatedReq })
    log.info('getHealthStatus called')
    const message = `It's always sunny in philadelhpia`
    return Promise.all([
      HealthRouter.checkStripeStatus(),
      HealthRouter.checkRabbitStatus()
    ])
      .then(function respondToRequest (services) {
        const isHealthy = !!services.every(service => !!service.isHealthy)
        return res.status(200).json({ message, isHealthy, services })
      })
      .catch(err => {
        return res.status(500).json({ err })
      })
  }

  /**
     * Get the status for health status
     *
     * Things tested by route
     * - BigPoppa Connection
     * - Stripe status
     * - Runnable API connection
     * - RabbitMQ status
     *
     * @param {Object} validatedReq - Validated request against `getSchema`
     * @return {Promise}
     * @resolves {Object}
     */
    static getServicesHealthStatus (validatedReq, res) {
      const log = logger.child({ validatedReq })
      log.info('getHealthStatus called')
      const message = `It's always sunny in philadelhpia`
      return Promise.all([
        HealthRouter.checkBigPoppaStatus(),
        HealthRouter.checkStripeStatus(),
        HealthRouter.checkAPIStatus(),
        HealthRouter.checkRabbitStatus()
      ])
        .then(function respondToRequest (services) {
          const isHealthy = !!services.every(service => !!service.isHealthy)
          return res.status(200).json({ message, isHealthy, services })
        })
        .catch(err => {
          return res.status(500).json({ err })
        })
    }

  static checkBigPoppaStatus () {
    const log = logger.child({ method: 'checkBigPoppaStatus' })
    log.info('called')
    const serviceName = 'big-poppa'
    const randomGithubId = Math.floor(Math.random() * 9999)
    return bigPoppa.getOrganizations({ githubId: randomGithubId })
      .then(response => {
        if (!Array.isArray(response)) {
          log.warn({ randomGithubId }, 'Big Poppa did not return an array when requesting organizations')
          throw new Error('Organizations response is not an array')
        }
        return HealthRouter.returnSuccessResponse(serviceName)
      })
      .catch(error => HealthRouter.returnFailureResponse(serviceName, error))
  }

  static checkStripeStatus () {
    const log = logger.child({ method: 'checkStripeStatus' })
    log.info('called')
    const serviceName = 'stripe'
    return stripeClient.accounts.list({ limit: 1 })
      .then(response => {
        log.trace({ response }, 'Response from stripe request')
        if (!Array.isArray(response.data)) {
          log.warn('Stripe did not return an array when requesting accounts')
          throw new Error('Accounts resposne is not an array')
        }
        if (response.data[0].display_name.match(/runnable/i)) {
          throw new Error('Account does not belong to Runnable')
        }
        return HealthRouter.returnSuccessResponse(serviceName)
      })
      .catch(error => HealthRouter.returnFailureResponse(serviceName, error))
  }

  static checkAPIStatus () {
    const serviceName = 'runnable-api'
    const log = logger.child({ method: 'checkAPIStatus', serviceName })
    log.info('called')
    const randomGithubId = Math.floor(Math.random() * 9999)
    return runnableAPI.getAllNonTestingInstancesForUserByGithubId(randomGithubId)
      .then(response => {
        if (!Array.isArray(response)) {
          log.warn({ randomGithubId }, 'Service did not return an array when requesting instances')
          throw new Error('Instances resposne is not an array')
        }
        return HealthRouter.returnSuccessResponse(serviceName)
      })
      .catch(error => HealthRouter.returnFailureResponse(serviceName, error))
  }

  static checkRabbitStatus () {
    const serviceName = 'rabbitmq'
    const log = logger.child({ method: 'checkRabbitStatus', serviceName })
    log.info('called')
    const rabbitmq = new RabbitMQ()
    return rabbitmq.connect()
      .then(() => rabbitmq.disconnect())
      .then(() => HealthRouter.returnSuccessResponse(serviceName))
      .catch(error => HealthRouter.returnFailureResponse(serviceName, error))
  }

  static returnSuccessResponse (serviceName) {
    const log = logger.child({ method: 'returnSuccessResponse', serviceName })
    let statusResponse = { serviceName, isHealthy: true }
    log.trace({ statusResponse }, 'services responded succsefully')
    return statusResponse
  }

  static returnFailureResponse (serviceName, error) {
    const log = logger.child({ method: 'returnFailureResponse', serviceName })
    let statusResponse = { serviceName, isHealthy: false, error }
    log.warn({ statusResponse, error }, 'services responded witht error')
    return statusResponse
  }
}

HealthRouter.getSchema = Joi.object({
  params: Joi.object({})
}).unknown().required().label('OrganizationRouter.get')

module.exports = HealthRouter
