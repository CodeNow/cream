'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
require('sinon-as-promised')(Promise)
const expect = require('chai').expect
const ErrorCat = require('error-cat')
const log = require('util/logger').child({ module: 'http' })

const server = require('http/server')
const rabbitmq = require('util/rabbitmq')
const runnableAPI = require('util/runnable-api-client')

describe('Creating a new server', () => {
  let apiUrl = process.env.RUNNABLE_API_URL
  let rabbitmqStub
  let apiLoginStub
  let processStub

  beforeEach(() => {
    rabbitmqStub = sinon.stub(rabbitmq, 'connect').resolves(true)
    apiLoginStub = sinon.stub(runnableAPI, 'login').resolves(true)
    processStub = sinon.stub(process, 'on').returns()
  })

  afterEach(() => {
    process.env.RUNNABLE_API_URL = apiUrl
    processStub.restore()
    rabbitmqStub.restore()
    apiLoginStub.restore()
    Object.keys(require.cache).forEach(function(key) {
      if (key.match(/http\/index.js/)) {
        delete require.cache[key]
      }
    })
  })

  it('should exit the process for a failed rabbitmq connection', () => {
    rabbitmqStub.rejects()
    require('http/index.js')
      .catch(function (err) {
        expect(err).to.exist
        sinon.assert.calledOnce(processStub)
      })
  })

  it('should exit the process for a failed api connection', () => {
    apiLoginStub.rejects({})
    require('http/index.js')
      .catch(function (err) {
        expect(err).to.exist
        sinon.assert.calledOnce(processStub)
      })
  })

  it('should not exit the process if connections are valid', () => {
    require('http/index.js')
      .then(function (err) {
        expect(err).not.to.exist
      })
  })
})
