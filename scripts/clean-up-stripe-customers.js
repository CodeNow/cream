'use strict'

'use strict'
require('loadenv')()

const Promise = require('bluebird')

const logger = require('util/logger').child({ module: 'scripts/migrage-organizations' })
const bigPoppa = require('util/big-poppa')
const stripeClient = require('util/stripe').stripeClient
const log = require('util/logger').child({ module: 'scripts/clean-up-stripe-customers' })

const fetchAndDeleteCustomers = (orgIds) => {
  log.trace({ orgIds: orgIds }, 'Fetch customers from Stripe')
  return stripeClient.customers.list({ limit: 100 })
    .then(customers => {
      let customersNotInBigPoppa = customers.filter(customer => !orgIds.includes(customer.id))
      log.trace({ customersNotInBigPoppa: customersNotInBigPoppa }, 'Filter customer that are not in Big Poppa')
      if (customersNotInBigPoppa.length > 0) {
        return Promise.map(customersNotInBigPoppa, c => stripeClient.customers.del(c.id))
          .then(() => fetchAndDeleteCustomers(orgIds))
      }
      return null
    })
}

Promise.resolve()
  .then(function getAllOrgs () {
    logger.info('getAllOrgs')
    return bigPoppa.getOrganizations({})
  })
  .then(function getAllOrgStripeCustomerIds (orgs) {
    logger.info('Map all organizations to get stripeCustomerId')
    return orgs.map(x => x.stripeCustomerId)
  })
  .then(function fetchAndDeleteCustomers (orgIds) {
    log.trace('Call fetchAndDeleteCustomers')
    return fetchAndDeleteCustomers(orgIds)
  })
