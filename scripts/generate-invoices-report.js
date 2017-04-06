'use strict'
const Promise = require('bluebird')
const csvStringify = require('csv-stringify')
const keypather = require('keypather')()
const fs = Promise.promisifyAll(require('fs'))
const GitHub = require('github')
const moment = require('moment')

if (!process.env.STRIPE_API_KEY) {
  throw new Error('An environment variable with STRIPE_API_KEY must be defined')
}

const stripeClient = require('stripe')(process.env.STRIPE_API_KEY)
const github = new GitHub({
  version: '3.0.0',
  timeout: 5000,
  requestMedia: 'application/json',
  headers: {
    'user-agent': process.env.APP_NAME
  }
})

github.authenticate({
  type: 'oauth',
  token: process.env.GITHUB_TOKEN
})

const recursiveGet = (charges, startingAfter, page) => {
  return stripeClient.charges.list({ limit: 100, starting_after: startingAfter || undefined })
  .then((response) => {
    charges = charges.concat(response.data.filter(x => !!x.captured))
    console.log('Fetching charges page...', page)
    let last = response.data[response.data.length - 1]
    if (response.data.length < 100) {
      return charges
    }
    return recursiveGet(charges, last.id, page + 1)
  })
}

console.log('Fetching charges...')
recursiveGet([], undefined, 1)
  .then(charges => {
    console.log('Charges fetched. Fetching invoices...')
    return Promise.map(charges, (charge, i, total) => {
      const invoiceId = charge.invoice
      return stripeClient.invoices.retrieve(invoiceId)
        .tap(() => console.log(`Fetched invoice ${invoiceId}... ${i} of ${total}`))
        .then(invoice => {
          invoice.charge = charge
          return invoice
        })
    })
  })
  .tap(() => console.log('Finished fetching invoices.'))
  .then(invoices => {
    return Promise.mapSeries(invoices, (invoice, i, total) => {
      return stripeClient.customers.retrieve(invoice.customer)
      .then(customer => {
        const githubId = customer.metadata.githubId
        invoice.githubId = githubId
        return Promise.fromCallback(cb => {
          github.users.getById({ id: githubId }, cb)
        })
      })
      .tap(() => console.log(`Fetched organization name... ${i} of ${total}`))
      .then(res => Object.assign(invoice, { githubOrg: res.data }))
    })
  })
  .tap(() => console.log('Finished fetching organization names.'))
  .then(invoices => {
    console.log('Org names fetched...')
    invoices = invoices
      .filter(invoice => invoice.total > 0 && !!invoice.paid)
      .sort((a, b) => a.date - b.date)
    const titles = [
      'Date', 'Invoice Id', 'Stripe Customer ID',
      'Github ID', 'Customer Name', 'Plan', 'User Count',
      'Subtotal', 'Total amount paid', 'Refunded',
      'Dicsount', 'Users'
    ]
    const result = invoices.reduce((result, invoice) => {
      const date = moment(invoice.date, 'X').format('MM/DD/YYYY')
      const coupon = keypather.get(invoice, 'discount.coupon.id')
      const plan = keypather.get(invoice, 'lines.data[0].plan.name')
      const userQuantity = keypather.get(invoice, 'lines.data[0].quantity')
      const users = keypather.get(invoice, 'lines.data[0].metadata.users')
      const subtotal = invoice.subtotal / 100
      const total = invoice.total / 100
      const refunded = keypather.get(invoice, 'charge.refunded') ? 'Yes' : ''
      return result.concat([[
        date,
        invoice.id,
        invoice.customer,
        invoice.githubId,
        invoice.githubOrg.login,
        plan,
        userQuantity,
        subtotal,
        total,
        refunded,
        coupon,
        users
      ]])
    }, [titles])
    return Promise.fromCallback(cb => csvStringify(result, cb))
  })
  .then(csvString => {
    console.log('Writing file...')
    const fileName = `${__dirname}/invoice-report-${Date.now()}.csv`
    fs.appendFileSync(fileName, csvString)
    console.log(`Done. CSV save to ${fileName}`)
  })
  .catch(err => {
    console.error(`Error Generating File: ${err.message}`)
    process.exit(1)
  })
