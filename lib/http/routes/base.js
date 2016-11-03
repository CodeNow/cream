'use strict'

const Promise = require('bluebird')

const Joi = require('util/joi')
const logger = require('util/logger').child({ module: 'BaseRouter' })
const ValidationError = require('errors/validation-error')

module.exports = class BaseRouter {

  /**
   * Create a route. Take a route and a schema and returns a new route function that
   * validates against the schema and handles errors.
   *
   * This method should only handle two things for routes:
   *
   * 1. Validation
   * 2. Error handling
   *
   * If that's not the case, it should not be here.
   *
   * Please don't turn this little, simple function in a beautiful,
   * unmaintainable explosion of TJ magic.
   *
   * @param {Function}    routerFunction - Function that takes a request and a response
   * @param {Object}      schema         - A joi schema to validate the request
   * @returns {Function}                 - A function that can be passed to an express router
   */
  static createRoute (routerFunction, schema) {
    if (!routerFunction) {
      throw new Error('There is no router defined')
    }
    if (!schema) {
      throw new Error('There is no schema specified for this route')
    }
    // Bind `errorHandler` to its router
    const errorHandler = this.errorHandler.bind(this)
    return Promise.method(function () {
      const log = logger.child()
      log.info('Route called')
      let args = [].slice.call(arguments)
      // Get request and splice off first element
      let rawRequest = args.shift(0)
      // Get a reference to the response to pass to the errorHandler
      let res = args[0]
      // Validate request against schema. Strip anything not specified in the
      // schema
      log.trace({ req: rawRequest }, 'Route request')
      return Joi.validateAsync(rawRequest, schema, { stripUnknown: true })
        .tap(request => log.trace({ request: request }, 'Router handler validated'))
        // Replace original request with validated request
        .then(request => routerFunction.apply(routerFunction, [request].concat(args)))
        // Pass original request, response, and error to `errorHandler`
        .catch(err => errorHandler(res, err))
    })
  }

  /**
   * Handle all errors thrown by routes. Invokes the response `status` and `json`
   * methods to provide a response according to the error provided.
   *
   * @param {Object}    response - Express response object
   * @param {Error}     err      - Error thrown by router
   * @returns {Object}           - Express response object
   */
  static errorHandler (res, err) {
    const log = logger.child({ errMessage: err.message })
    log.info('errorHandler called')
    if (err.isJoi) {
      log.trace('400 Joi Validation Error')
      // Joi error are pretty massive. Let's just send back the message
      return res.status(400).json({ statusCode: 400, message: `Validation Error: ${err.message}`, err: err.message })
    }
    if (err instanceof ValidationError) {
      log.trace('400 Validation Error')
      return res.status(400).json({ statusCode: 400, message: `Validation Error: ${err.message}`, err: err })
    }
    log.trace('500 Internal Server Error')
    return res.status(500).json({ statusCode: 500, message: 'Internal Server Error', err: err.message })
  }

}
