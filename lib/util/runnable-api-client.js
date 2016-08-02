'use strict'

const Promise = require('bluebird')
const Runnable = require('@runnable/api-client')

const client = new Runnable(process.RUNNABLE_API_URL, { userContentDomain: process.env.RUNNABLE_USER_CONTENT_DOMAIN })

module.exports = class RunnableAPIClient {

  static login () {
    return Promise.fromCallback(cb => {
      client.githubLogin(process.env.HELLO_RUNNABLE_GITHUB_TOKEN, cb)
    })
  }

  static logout () {
    return Promise.fromCallback(cb => {
      client.logout(cb)
    })
  }

  static getAllInstancesForUserByGithubId (githubId) {
    return RunnableAPIClient.login()
      .then(() => {
        return Promise.fromCallback(cb => {
          client.fetchInstances({ owner: { githubId: githubId } }, cb)
        })
      })
      .then(() => RunnableAPIClient.logout())
  }

}
