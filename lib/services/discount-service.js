
'use strict'

const moment = require('moment')

const logger = require('util/logger').child({ module: 'stripe' })

const BETA_DISCOUNT_SIGNUP_DEADLINE = moment('2016-09-21T07:00:00.000Z') // Wednesday, September 21st 2016, 12:00:00 am PST
const BETA_PLAN_ID = 'Beta'

module.exports = class DiscountService {

  static getCouponAtSignUpTime (org) {
    const log = logger.child({ org: org })
    log.info('getCouponAtSignUpTime called')
    const orgCreatedTime = moment(org.created)
    log.trace({
      orgCreatedTime: orgCreatedTime.toISOString(),
      BETA_DISCOUNT_SIGNUP_DEADLINE: BETA_DISCOUNT_SIGNUP_DEADLINE.toISOString()
    }, 'getCouponAtSignUpTime called')
    // Beta
    if (
      orgCreatedTime.isBefore(BETA_DISCOUNT_SIGNUP_DEADLINE)
    ) {
      log.trace('Assigning `BETA_PLAN_ID` plan')
      return BETA_PLAN_ID
    }
    log.trace('No coupone found')
    return null
  }

}
