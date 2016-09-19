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
      org.created = '2016-09-20T06:00:00.000Z' // An hour before beta deadline
      let planId = DiscountService.getCouponAtSignUpTime(org)
      expect(planId).to.equal('Beta')
    })

    it('should not return the coupon if past beta', () => {
      org.created = '2016-09-20T08:00:00.000Z' // An hour after beta deadline
      let planId = DiscountService.getCouponAtSignUpTime(org)
      expect(planId).to.not.equal('Beta')
    })

    it('should return a GA copuon if current date is before deadline', () => {
      org.created = '2016-09-20T08:00:00.000Z' // An hour after beta deadline
      let planId = DiscountService.getCouponAtSignUpTime(org)
      expect(planId).to.equal('GA')
    })

    it('should not return any  the coupon if past GA', () => {
      org.created = '2017-03-20T07:00:00.000Z' // An hour after GA deadline
      let planId = DiscountService.getCouponAtSignUpTime(org)
      expect(planId).to.equal(null)
    })
  })
})
