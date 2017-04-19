'use strict'

const Promise = require('bluebird')
const sinon = require('sinon')
const expect = require('chai').expect
require('sinon-as-promised')(Promise)

const runnableClient = require('@runnable/api-client')
const runnableAPI = require('util/runnable-api-client')

describe('Runnable API Client', () => {
  let loginStub
  let logoutStub
  let fetchInstancesStub
  let instances

  beforeEach('Stub out methods', () => {
    instances = [
      {
        name: 'hello',
        attrs: {
          isTesting: false
        }
      },
      {
        name: 'hello1',
        attrs: {
          isTesting: true
        }
      },
      {
        name: 'hello2',
        attrs: {
          isTesting: false
        }
      }
    ]
    loginStub = sinon.stub(runnableClient.prototype, 'githubLogin').yieldsAsync(null)
    logoutStub = sinon.stub(runnableClient.prototype, 'logout').yieldsAsync(null)
    fetchInstancesStub = sinon.stub(runnableClient.prototype, 'fetchInstances').yieldsAsync(null, instances)
  })

  afterEach('Restore methods', () => {
    loginStub.restore()
    logoutStub.restore()
    fetchInstancesStub.restore()
  })

  describe('#login', () => {
    it('should login from Runnable', () => {
      return runnableAPI.login()
        .then(() => {
          sinon.assert.calledOnce(loginStub)
          sinon.assert.calledWithExactly(
            loginStub,
            process.env.HELLO_RUNNABLE_GITHUB_TOKEN,
            sinon.match.func
          )
        })
    })
  })

  describe('#logout', () => {
    it('should logout from Runnable', () => {
      return runnableAPI.logout()
        .then(() => {
          sinon.assert.calledOnce(logoutStub)
          sinon.assert.calledWithExactly(
            logoutStub,
            sinon.match.func
          )
        })
    })
  })

  describe('#getAllNonTestingInstancesForUserByGithubId', () => {
    it('should fetch the instances', () => {
      let githubId = 23423
      return runnableAPI.getAllNonTestingInstancesForUserByGithubId(githubId)
        .then(() => {
          sinon.assert.calledOnce(fetchInstancesStub)
          sinon.assert.calledWithExactly(
            fetchInstancesStub,
            { owner: { github: githubId }, masterPod: true },
            sinon.match.func
          )
        })
    })

    it('should filter out testing instances', () => {
      let githubId = 23423
      return runnableAPI.getAllNonTestingInstancesForUserByGithubId(githubId)
        .then((instances) => {
          expect(instances).to.have.lengthOf(2)
        })
    })
  })
})

