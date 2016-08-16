'use strict'

const Promise = require('bluebird')

const logger = require('util/logger').child({ module: 'scripts/migrage-organizations' })
const CreateOrganizationInStripeAndStartTrial = require('workers/organization.plan.start-trial')
const UpdatePlan = require('workers/organization.plan.update')
const bigPoppa = require('util/big-poppa')

const EntityExistsInStripeError = require('errors/entity-exists-error')

let orgIds = []
let orgsSuccsefullyStartedInTrial = []
let orgsSuccsefullyUpdated = []

Promise.resolves()
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
      .catch(EntityExistsInStripeError, () => {
        logger.warn({ org: org }, 'Organization already exists in Stripe')
        return org
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

