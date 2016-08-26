'use strict'

const Promise = require('bluebird')
const expect = require('chai').expect
require('sinon-as-promised')(Promise)

const rabbitMQInstance = require('util/rabbitmq')

describe('RabbitMQ', () => {
  describe('Constructor', () => {
    it('should pass the name and hostname', () => {
      let rabbitmq = new rabbitMQInstance.constructor()
      expect(rabbitmq).to.have.property('hostname', process.env.RABBITMQ_HOSTNAME)
      expect(rabbitmq).to.have.property('name', process.env.APP_NAME)
    })
  })
})
