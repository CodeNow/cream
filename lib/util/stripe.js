'use strict'
module.exports = require('stripe')(process.env.STRIPE_API_KEY)
