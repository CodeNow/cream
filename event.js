'use strict'
const stripe = require('stripe')('sk_live_ZWLZtu5rxJ0ylSoF8xrHtNOw')
const moment = require('moment')
stripe.events.retrieve('evt_19libILYrJgOrBWzK14c8gW5').then(event => {
	let unixTimestamp = event.created
	console.log('UNIX timestamp', unixTimestamp)
	let time = moment(unixTimestamp, 'X')
	let timeInUTC = time.toISOString()
	let timeInPST = moment().format('MMMM Do YYYY, h:mm:ss a zz')
	console.log('UTC time', timeInUTC)
	console.log('PST time', timeInPST)
})