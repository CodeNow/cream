'use strict'
require('loadenv')()

const Promise = require('bluebird')

const logger = require('util/logger').child({ module: 'scripts/migrage-organizations' })
const bigPoppa = require('util/big-poppa')
const stripeClient = require('util/stripe').stripeClient
const log = require('util/logger').child({ module: 'scripts/clean-up-stripe-customers' })

const isDryRun = process.env.DRY_RUN

const fetchAndDeleteCustomers = (orgIds) => {
  log.trace({ orgIds: orgIds }, 'Fetch customers from Stripe')
  return stripeClient.customers.list({ limit: 100 })
    .then(res => {
      log.trace({ res: res }, 'Response from Stripe')
      let customers = res.data

      let customersNotInBigPoppa = customers.filter(customer => orgIds.indexOf(customer.id) === -1)
      log.trace({ numberOfcustomersNotInBigPoppa: customersNotInBigPoppa.length }, 'Filter customer that are not in Big Poppa')
      if (customersNotInBigPoppa.length > 0) {
        return Promise.map(customersNotInBigPoppa, customer => {
          log.trace({ customer: customer }, 'Deleting Stripe Customer')
          if (isDryRun) return null
          return stripeClient.customers.del(customer.id)
        })
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
    logger.info({ numberOfOrgs: orgs.length }, 'Map all organizations to get stripeCustomerId')
    let orgIds = orgs.map(x => x.stripeCustomerId).filter(x => !!x)
    log.trace({ orgIds: orgIds }, 'Call fetchAndDeleteCustomers')
    return fetchAndDeleteCustomers(orgIds)
  })
  .catch(err => log.error({ err: err }, 'Error'))
  .finally(process.exit)
