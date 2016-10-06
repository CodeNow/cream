'use strict'
require('loadenv')()
module.exports = require('stripe')(process.env.STRIPE_API_KEY)
