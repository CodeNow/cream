'use strict'

const _ = require('lodash')

module.exports = class Util {

  static convertObjectToCamelCase (obj) {
    return _.reduce(obj, function (memo, val, key) {
      memo[_.camelCase(key)] = val
      return memo
    }, {})
  }

}
