'use strict'
require('loadenv')()
const Promise = require('bluebird')
const keypather = require('keypather')()
const GitHub = require('github')

const github = new GitHub({
  version: '3.0.0',
  // Github cache configuration
  protocol: process.env.GITHUB_PROTOCOL,
  host: process.env.GITHUB_VARNISH_HOST,
  port: process.env.GITHUB_VARNISH_PORT,

  timeout: 5000,
  requestMedia: 'application/json',
  headers: {
    'user-agent': process.env.APP_NAME
  }
})
console.log(process.env)
github.authenticate({
  type: 'oauth',
  token: process.env.HELLO_RUNNABLE_GITHUB_TOKEN
})

var invoices = [
  {
    'amountDue': 52200,
    'discount': null,
    'paidBy': {
      'id': 51,
      'githubId': 1981198,
      'email': null
    },
    'periodEnd': '2016-09-09T17:19:24.000Z',
    'periodStart': '2016-08-26T17:19:24.000Z',
    'date': '2016-09-09T17:22:21.000Z',
    'total': 52200,
    'paid': true,
    'closed': true,
    'metadata': {
      'paymentMethodOwnerId': '51',
      'paymentMethodOwnerGithubId': '1981198'
    }
  },
  {
    'amountDue': 0,
    'discount': null,
    'paidBy': {
      'id': 46,
      'githubId': 495765,
      'email': null
    },
    'periodEnd': '2016-08-26T17:19:24.000Z',
    'periodStart': '2016-08-26T17:19:24.000Z',
    'date': '2016-08-26T17:19:24.000Z',
    'total': 0,
    'paid': true,
    'closed': true,
    'metadata': {
      'paymentMethodOwnerId': '46',
      'paymentMethodOwnerGithubId': '495765'
    }
  },
  {
    'amountDue': 0,
    'discount': null,
    'paidBy': {
      'id': 46,
      'githubId': 495765,
      'email': null
    },
    'periodEnd': '2016-08-26T01:27:10.000Z',
    'periodStart': '2016-08-26T01:27:10.000Z',
    'date': '2016-08-26T01:27:10.000Z',
    'total': 0,
    'paid': true,
    'closed': true,
    'metadata': {
      'paymentMethodOwnerId': '46',
      'paymentMethodOwnerGithubId': '495765'
    }
  },
  {
    'amountDue': 0,
    'discount': null,
    'paidBy': {
      'id': null,
      'githubId': 'null',
      'email': null
    },
    'periodEnd': '2016-08-23T17:38:36.000Z',
    'periodStart': '2016-08-23T17:38:36.000Z',
    'date': '2016-08-23T17:38:36.000Z',
    'total': 0,
    'paid': true,
    'closed': true,
    'metadata': {}
  }
]

Promise.map(invoices, function (invoice) {
  let githubId = keypather.get(invoice, 'paidBy.githubId')
  console.log({ githubId: githubId }, 'Fetching github user')
  if (!githubId) {
    return invoice
  }
  return Promise.fromCallback(cb => github.user.getById(githubId, cb))
    .then(function (githubUser) {
      invoice.paidBy.githubUser = githubUser
      return invoice
    })
    .catchReturn(invoice)
})
.then(console.log)
