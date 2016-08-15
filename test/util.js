'use strict'

const Promise = require('bluebird')

module.exports = class TestUtil {

  static poll (handler, interval, timeout) {
    function pollRecursive () {
      return handler()
        .then(bool => {
          if (bool) return true
          return Promise.delay(interval).then(pollRecursive)
        })
    }

    return pollRecursive()
      .timeout(timeout)
  }
}
