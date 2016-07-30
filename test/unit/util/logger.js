'use strict'

const expect = require('chai').expect

const logger = require('util/logger')

describe('logger', () => {
  describe('Serializers', () => {
    describe('#envSerializer', () => {
      let envSerializer = logger.serializers.env

      it('should return a  different object', () => {
        let obj = {}
        expect(envSerializer(obj)).to.not.equal(obj)
      })

      it('should not return any properties with `npm` except gitHead', () => {
        let obj = {
          npm_hello: 'hello',
          npm_package_gitHead: '1',
          wow: 'wow'
        }
        let returnObj = envSerializer(obj)
        expect(returnObj).to.have.property('wow')
        expect(returnObj).to.have.property('npm_package_gitHead')
        expect(returnObj).to.not.have.property('npm_hello')
      })

      it('should not return any properties with `npm`', () => {
        let obj = {
          npm_hello: 'hello',
          wow: 'wow'
        }
        let returnObj = envSerializer(obj)
        expect(returnObj).to.have.property('wow')
        expect(returnObj).to.not.have.property('npm_hello')
      })
    })

    describe('#errorSerializer', () => {
      let errorSerializer = logger.serializers.err

      it('should return a  different object', () => {
        let err = new Error('wow')
        expect(errorSerializer(err)).to.not.equal(err)
      })

      it('should add the `data` attribute to the object', () => {
        let obj = {}
        let err = new Error('super error')
        err.data = obj
        let returnObj = errorSerializer(err)
        expect(returnObj).to.have.property('message', 'super error')
        expect(returnObj).to.have.property('data', obj)
      })
    })

    describe('#reqSerializer', () => {
      let reqSerializer = logger.serializers.req

      it('should return a different object', () => {
        let obj = {}
        expect(reqSerializer(obj)).to.not.equal(obj)
      })

      it('should return certain properties', () => {
        let obj = {
          params: {},
          body: {},
          query: {},
          path: {},
          method: {},
          url: {},
          headers: {}
        }
        expect(reqSerializer(obj)).to.have.property('params')
        expect(reqSerializer(obj)).to.have.property('body')
        expect(reqSerializer(obj)).to.have.property('query')
        expect(reqSerializer(obj)).to.have.property('path')
        expect(reqSerializer(obj)).to.have.property('method')
        expect(reqSerializer(obj)).to.have.property('url')
        expect(reqSerializer(obj)).to.have.property('headers')
      })

      it('should not return unwanted properties', () => {
        let obj = {
          wow: {},
          superWow: {}
        }
        expect(reqSerializer(obj)).to.not.have.property('wow')
        expect(reqSerializer(obj)).to.not.have.property('superWow')
      })
    })
  })
})

