'use strict'
require('loadenv')()

const Promise = require('bluebird')

const log = require('util/log').child({ module: 'scripts/migrage-preview-customers' })
const bigPoppa = require('util/big-poppa')
const rabbitmq = require('util/rabbitmq')
const runnableAPI = require('util/runnable-api-client')

const CreateOrganizationInStripeAndStartTrial = require('workers/organization.plan.start-trial')
const UpdatePlan = require('workers/organization.plan.update')

const WorkerStopError = require('error-cat/errors/worker-stop-error')
const isDryRun = process.env.DRY_RUN

let orgIds = []
let deleteStripeCustomerIds = []
let orgsSuccsefullyStartedInTrial = []
let orgsSuccsefullyUpdated = []

/**
 * Because we promised all preview customers we were not going to charge them
 * until 9/9 we have to end their subscription on Stripe and create a new one
 */

Promise.resolve()
  .then(function connectToRunnableAPIClient () {
    return Promise.all([
      rabbitmq.connect(),
      runnableAPI.login()
    ])
  })
  .then(function getAllOrgs () {
    log.info('getAllOrgs')
    return bigPoppa.getOrganizations({})
  })
  .filter(function getAllCustomresWithSpecificTrialEnd (org) {
    log.trace({ org: org }, 'getAllCustomresWithSpecificTrialEnd')
    // Get all customers with a trialEnd of ...
    return org.trialEnd === '2016-09-09T18:00:00.000Z'
  })
  .tap(function logOrgs (orgsToRestartTrial) {
    orgIds = orgsToRestartTrial.map(x => x.id)
    log.info({ orgIds: orgIds }, 'Orgs with set `trialEnd`')
  })
  .mapSeries(function removeStripeCustomerId (org) {
    log.trace({ org: org }, 'Remove `stripeCustomerId` for org')
    deleteStripeCustomerIds.push(org.stripeCustomerId)
    if (isDryRun) return org
    return bigPoppa.updateOrganization(org.id, {
      stripeCustomerId: null
    })
      .return(org)
  })
  .mapSeries(function startTrialForAllOrgs (org) {
    orgIds.push(org.id)
    log.info({ org: org }, 'startTrialForAllOrgs')
    if (isDryRun) return org
    return CreateOrganizationInStripeAndStartTrial({
      organization: {
        id: org.id
      }
    })
      .catch(WorkerStopError, err => {
        if (err.message.match(/already.*has.*stripeCustomerId/)) {
          log.warn({ org: org }, 'Organization already exists in Stripe')
          return org
        }
        throw err
      })
      .return(org)
  })
  .mapSeries(function updateNumberOfUsersInOrg (org) {
    orgsSuccsefullyStartedInTrial.push(org.id)
    log.info({ org: org }, 'startTrialForAllOrgs')
    if (isDryRun) return org
    return UpdatePlan({
      organization: {
        id: org.id
      }
    })
      .tap(() => {
        orgsSuccsefullyUpdated.push(org.id)
      })
      .return(org)
  })
  .then(function logResults () {
    log.info({
      isDryRun: isDryRun,
      numberOfOrgs: orgIds.length,
      numberOfOrgsSuccsefullyInTrial: orgsSuccsefullyStartedInTrial.length,
      numberOfOrgsSuccsefullyUpdated: orgsSuccsefullyUpdated.length,
      orgIds: orgIds,
      orgsSuccsefullyStartedInTrial: orgsSuccsefullyStartedInTrial,
      orgsSuccsefullyUpdated: orgsSuccsefullyUpdated
    }, 'Migration completed')
  })
  .catch(err => {
    log.error({ err: err }, 'Error creating and updating users')
  })
  .finally(() => {
    log.info('Finished')
    process.exit()
  })
