'use strict'
require('loadenv')()

const Promise = require('bluebird')
const expect = require('chai').expect

const superagentPromisePlugin = require('superagent-promise-plugin')
const request = superagentPromisePlugin.patch(require('superagent'))
superagentPromisePlugin.Promise = Promise

const httpServer = require('http/server')

describe('Health Integration Test', () => {
  // HTTP
  before('Start HTTP server', () => httpServer.start())
  after('Stop HTTP server', () => httpServer.stop())

  it('should always be sunny in philadelphia', () => {
    return request
      .get(`http://localhost:${process.env.PORT}/health`)
      .then(res => {
        expect(res.status).to.equal(200)
      })
  })
})
