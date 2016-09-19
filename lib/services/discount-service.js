'use strict'

const moment = require('moment')

const logger = require('util/logger').child({ module: 'stripe' })

const BETA_DISCOUNT_SIGNUP_DEADLINE = moment('2016-09-20T07:00:00.000Z') // Wednesday, September 20st 2016, 12:00:00 am PST
const BETA_COUPON_ID = 'Beta'

const GA_DISCOUNT_SIGNUP_DEADLINE = moment('2017-03-20T07:00:00.000Z') // Monday, March 20th 2017, 12:00:00 am PST
const GA_COUPON_ID = 'GA'

class DiscountService {

  /**
   * Get the coupon for an org
   *
   * @param {Object}   org         - Organization model instance
   * @param {String}   org.created - ISO8601 timestamp for when org was created
   * @returns {String}
   */
  static getCouponAtSignUpTime (org) {
    const log = logger.child({ org: org })
    log.info('getCouponAtSignUpTime called')
    const orgCreatedTime = moment(org.created)
    log.trace({
      orgCreatedTime: orgCreatedTime.toISOString(),
      GA_DISCOUNT_SIGNUP_DEADLINE: DiscountService.GA_DISCOUNT_SIGNUP_DEADLINE.toISOString(),
      BETA_DISCOUNT_SIGNUP_DEADLINE: DiscountService.BETA_DISCOUNT_SIGNUP_DEADLINE.toISOString()
    }, 'getCouponAtSignUpTime called')
    // Beta
    if (
      orgCreatedTime.isBefore(DiscountService.BETA_DISCOUNT_SIGNUP_DEADLINE)
    ) {
      log.trace('Assigning `BETA_COUPON_ID` coupon')
      return BETA_COUPON_ID
    }
    // GA
    if (
      orgCreatedTime.isBefore(DiscountService.GA_DISCOUNT_SIGNUP_DEADLINE)
    ) {
      log.trace('Assigning `GA_COUPON_ID` coupon')
      return GA_COUPON_ID
    }
    log.trace('No coupon found')
    return null
  }
}

DiscountService.BETA_DISCOUNT_SIGNUP_DEADLINE = BETA_DISCOUNT_SIGNUP_DEADLINE
DiscountService.BETA_COUPON_ID = BETA_COUPON_ID
DiscountService.GA_DISCOUNT_SIGNUP_DEADLINE = GA_DISCOUNT_SIGNUP_DEADLINE
DiscountService.GA_COUPON_ID = GA_COUPON_ID

module.exports = DiscountService
