'use strict'
require('loadenv')()

const Promise = require('bluebird')

const logger = require('util/logger').child({ module: 'scripts/migrage-organizations' })
const bigPoppa = require('util/big-poppa')
const rabbitmq = require('util/rabbitmq')
const runnableAPI = require('util/runnable-api-client')

const CreateOrganizationInStripeAndStartTrial = require('workers/organization.plan.start-trial')
const UpdatePlan = require('workers/organization.plan.update')

const WorkerStopError = require('error-cat/errors/worker-stop-error')
console.log(process.env)

let orgIds = []
let orgsSuccsefullyStartedInTrial = []
let orgsSuccsefullyUpdated = []

Promise.resolve()
  .then(function connectToRunnableAPIClient () {
    return Promise.all([
      rabbitmq.connect(),
      runnableAPI.login()
    ])
  })
  .then(function getAllOrgs () {
    logger.info('getAllOrgs')
    return bigPoppa.getOrganizations({})
  })
  .map(function startTrialForAllOrgs (org) {
    orgIds.push(org.id)
    logger.info({ org: org }, 'startTrialForAllOrgs')
    return CreateOrganizationInStripeAndStartTrial({
      organization: {
        id: org.id
      }
    })
      .catch(WorkerStopError, err => {
        if (err.message.match(/already.*has.*stripeCustomerId/)) {
          logger.warn({ org: org }, 'Organization already exists in Stripe')
          return org
        }
        throw err
      })
      .return(org)
  })
  .map(function updateNumberOfUsersInOrg (org) {
    orgsSuccsefullyStartedInTrial.push(org.id)
    logger.info({ org: org }, 'startTrialForAllOrgs')
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
    logger.info({
      numberOfOrgs: orgIds.length,
      numberOfOrgsSuccsefullyInTrial: orgsSuccsefullyStartedInTrial.length,
      numberOfOrgsSuccsefullyUpdated: orgsSuccsefullyUpdated.length,
      orgIds: orgIds,
      orgsSuccsefullyStartedInTrial: orgsSuccsefullyStartedInTrial,
      orgsSuccsefullyUpdated: orgsSuccsefullyUpdated
    }, 'Migration completed')
  })
  .catch(err => {
    logger.error({ err: err }, 'Error creating and updating users')
  })
  .finally(process.exit)

