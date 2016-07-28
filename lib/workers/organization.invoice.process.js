'use strict'

const Promise = require('bluebird')
const Joi = Promise.promisifyAll(require('joi'))

const logger = require('util/logger').child({ module: 'worker/organization.invoice.process' })

const WorkerStopError = require('error-cat/errors/worker-stop-error')

/**
 * Schema for user.create jobs.
 * @type {Joi~Schema}
 */
const jobSchema = Joi.object({
  tid: Joi.string().guid(),
  stripeCustomerId: Joi.string().required()
})

/**
 * Process when an invoice is received from Stripe. This should happen at about
 * an hour before the invoice is sent to the customer/organization.
 *
 * This worker should do the following:
 *
 * 1. Add amount of minimum users if organization has less than X number of users
 * 2. Add credit/charges depending the on the number of instances an org has or
 * change their plan (TBD)
 *
 * @param {Object}    job                  - job passed by RabbitMQ
 * @param {Number}    job.stripeCustomerId - Stripe Customer ID
 * @return {Promise}
 */
module.exports = function ProcessInvoideForOrganization (job) {
  const log = logger.child({ job: job, method: 'ProcessInvoideForOrganization' })
  log.info('ProcessInvoideForOrganization called')
  return Joi.validateAsync(job, jobSchema)
    .catch(err => {
      throw new WorkerStopError(
        `Invalid Job: ${err.toString()}`,
        { err: err }
      )
    })
}
