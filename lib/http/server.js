'use strict'

require('loadenv')()

const Promise = require('bluebird')
const http = require('http')
const express = require('express')
const bodyParser = require('body-parser')

const OrganizationRouter = require('http/routes/organization')
const UserRouter = require('http/routes/user')
const log = require('util/logger').child({ module: 'http/server' })

/**
 * Module level wrapper for the big-poppa HTTP server.
 */
class Server {

  /**
   * Instantiate the express app
   */
  constructor () {
    this.app = Server.createApp()
  }

  /**
   * Create an express app with all its routes and middleware
   *
   * @returns {Object} - Express app instance
   */
  static createApp () {
    const app = express()

    // Load middleware
    app.use(bodyParser.json())

    // Load Routes
    log.trace('Setting routes')
    app.use('/organization', OrganizationRouter.router())
    app.use('/user', UserRouter.router())
    return app
  }

  /**
   * Start the app by create an HTTP Server
   *
   * @resolves{void}
   * @return {Promise}
   */
  start () {
    this.httpServer = http.createServer(this.app)
    return Promise.fromCallback(cb => {
      this.httpServer.listen(process.env.PORT, cb)
    })
  }

  /**
   * Stop the HTTP server
   *
   * @resolves{void}
   * @return {Promise}
   */
  stop () {
    return Promise.fromCallback(cb => this.httpServer.close(cb))
  }

}

module.exports = new Server()
