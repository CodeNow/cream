'use strict'
require('loadenv')()

const Promise = require('bluebird')

const logger = require('util/logger').child({ module: 'scripts/migrage-organizations' })
const bigPoppa = require('util/big-poppa')
const stripeClient = require('util/stripe').stripeClient
const log = require('util/logger').child({ module: 'scripts/clean-up-stripe-customers' })

const isDryRun = process.env.DRY_RUN

const getAllStripeCustomers = () => {
  log.trace('getAllStripeCustomers call')
  let allCustomers = []

  const _getAllStripeCustomers = (lastCustomerId) => {
    log.trace('Fetch customers again')
    let query = { limit: 10 }
    if (lastCustomerId) {
      query.starting_after = lastCustomerId
    }
    log.trace(query, 'Fetch customers again')
    return stripeClient.customers.list(query)
      .then(res => {
        log.trace({ dataLength: res.data.length }, 'Number of customers')
        allCustomers = allCustomers.concat(res.data)
        if (res.has_more) {
          log.trace('Has more...')
          let lastCustomerId = res.data[res.data.length - 1].id
          return _getAllStripeCustomers(lastCustomerId)
        }
        log.trace({ allCustomers: allCustomers.length }, 'Number of customers END')
        return
      })
  }
  return _getAllStripeCustomers()
    .then(() => allCustomers)
}

const fetchAndDeleteCustomers = (orgIds) => {
  log.trace({ orgIds: orgIds }, 'Fetch customers from Stripe')
  return getAllStripeCustomers()
    .then(customers => {
      log.trace({ customers: customers.length }, 'Response from Stripe')

      let customersNotInBigPoppa = customers.filter(customer => orgIds.indexOf(customer.id) === -1)
      log.trace({
        numberOfcustomersNotInBigPoppa: customersNotInBigPoppa.length,
        customers: customers.length,
        orgIds: orgIds.length
      }, 'Filter customer that are not in Big Poppa')
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
  .finally(function () {
    log.trace('Finished')
    process.exit()
  }
