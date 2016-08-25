'use strict'

const moment = require('moment')

const PREVIEW_DISCOUNT_SIGNUP_DEADLINE = moment('2016-08-24T07:00:00.000Z') // Wednesday, August 24th 2016, 12:00:00 am PST
const PREVIEW_DISCOUNT_PAYMENT_METHOD_DEADLINE = moment('2016-09-10T07:00:00.000Z') // Saturday, September 10th 2016, 12:00:00 am PST
const BETA_DISCOUNT_SIGNUP_DEADLINE = moment('2016-09-21T07:00:00.000Z') // Wednesday, September 21st 2016, 12:00:00 am PST

const PREVIEW_PLAN_ID = 'Preview'
const BETA_PLAN_ID = 'Beta'

module.exports = class DiscountService {

  static getDiscountAtPaymentMethodTime (org) {
    const orgCreatedTime = moment(org.created)
    const paymentMethodCreatedTime = moment()
    const trialEndTime = moment(org.trialEnd)
    // Preview
    if (
      orgCreatedTime.isBefore(PREVIEW_DISCOUNT_SIGNUP_DEADLINE) &&
      paymentMethodCreatedTime.isBefore(PREVIEW_DISCOUNT_PAYMENT_METHOD_DEADLINE)
    ) {
      return PREVIEW_PLAN_ID
    }
    // Beta
    if (
      orgCreatedTime.isBefore(BETA_DISCOUNT_SIGNUP_DEADLINE) &&
      paymentMethodCreatedTime.isBefore(trialEndTime) // Trial should not be over
    ) {
      return BETA_PLAN_ID
    }
    return null
  }

}
