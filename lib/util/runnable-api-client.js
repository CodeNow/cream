'use strict'

const Promise = require('bluebird')
const RunnableClient = require('@runnable/api-client')

console.log('process.env.RUNNABLE_API_URL', process.env.RUNNABLE_API_URL)
const client = new RunnableClient(process.env.RUNNABLE_API_URL, { userContentDomain: process.env.RUNNABLE_USER_CONTENT_DOMAIN })

module.exports = class RunnableAPIClient {

  /**
   * Login into Runnable API Client
   *
   * @resolves {void}
   * @returns {Promise}
   */
  static login () {
    console.log('- login', process.env.HELLO_RUNNABLE_GITHUB_TOKEN)
    return Promise.fromCallback(cb => {
      client.githubLogin(process.env.HELLO_RUNNABLE_GITHUB_TOKEN, cb)
    })
    .catch(console.log)
  }

  /**
   * Logout from Runnable API Client
   *
   * @resolves {void}
   * @returns {Promise}
   */
  static logout () {
    return Promise.fromCallback(cb => {
      client.logout(cb)
    })
  }

  /**
   * Get all non-testing instances for a user
   *
   * @param {Number} githubId - Github ID for organization
   * @resolves {Array<Object>} instances - All instances owned by user
   * @returns {Promise}
   */
  static getAllNonTestingInstancesForUserByGithubId (githubId) {
    return Promise.fromCallback(cb => {
      client.fetchInstances({ owner: { github: githubId }, masterPod: true }, cb)
    })
    .filter(instance => !instance.isTesting)
  }

}
