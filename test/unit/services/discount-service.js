'use strict'

const Promise = require('bluebird')
const expect = require('chai').expect
const moment = require('moment')
require('sinon-as-promised')(Promise)

const DiscountService = require('services/discount-service')

describe('DiscountService', () => {
  let org
  let BETA_DISCOUNT_SIGNUP_DEADLINE

  beforeEach('Setup mocks for orgs', () => {
    org = {
      created: moment().subtract(1, 'days')
    }
    BETA_DISCOUNT_SIGNUP_DEADLINE = DiscountService.BETA_DISCOUNT_SIGNUP_DEADLINE
  })

  afterEach('Restore values on object', () => {
    DiscountService.BETA_DISCOUNT_SIGNUP_DEADLINE = BETA_DISCOUNT_SIGNUP_DEADLINE
  })

  describe('#getCouponAtSignUpTime', () => {
    it('should return a BETA coupone if current date is before deadline', () => {
      let planId = DiscountService.getCouponAtSignUpTime(org)
      expect(planId).to.equal('Beta')
    })

    it('should not return no coupon if past beta', () => {
      DiscountService.BETA_DISCOUNT_SIGNUP_DEADLINE = moment().subtract(2, 'days')
      let planId = DiscountService.getCouponAtSignUpTime(org)
      expect(planId).to.equal(null)
    })
  })
})
