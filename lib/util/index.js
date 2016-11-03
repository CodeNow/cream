'use strict'

const _ = require('lodash')
const log = require('util/logger').child({ module: 'util' })

module.exports = class Util {

  static convertObjectToCamelCase (obj) {
    return _.reduce(obj, function (memo, val, key) {
      memo[_.camelCase(key)] = val
      return memo
    }, {})
  }

  static logErrorAndKeepGoing (logObject, message) {
    return (err) => {
      log.warn(Object.assign(logObject, { err }), message)
      return undefined
    }
  }

}
