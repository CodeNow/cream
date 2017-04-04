'use strict'
const Promise = require('bluebird')
const csvStringify = require('csv-stringify')
const keypather = require('keypather')()
const BigPoppaClient = require('@runnable/big-poppa-client')
const fs = Promise.promisifyAll(require('fs'))

const bigPoppa = new BigPoppaClient('localhost:7788') // Setup an ssh tunnel

if (!process.env.STRIPE_API_KEY) {
  throw new Error('An environment variable with STRIPE_API_KEY must be defined')
}

const stripeClient = require('stripe')(process.env.STRIPE_API_KEY)

const recursiveGet = (charges, starting_after, page) => {
  return stripeClient.charges.list({ limit: 100, starting_after: starting_after || undefined })
  .then((response) => {
    charges = charges.concat(response.data.map(x => x.invoice))
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
  .then(invoiceIds => {
    console.log('Charges fetched. Fetching invoices...')
    let count = 0
    return Promise.map(invoiceIds, invoiceId => {
      return stripeClient.invoices.retrieve(invoiceId)
        .tap(() => console.log('Fetched invoice...', count++))
    })
  })
  .map(invoice => {
    console.log('Invoices fetched...')
    return bigPoppa.getOrganizations({ stripeCustomerId: invoice.customer })
      .then(org => Object.assign(invoice, { organizationName: org[0].name }))
  })
  .then(invoices => {
    console.log('Org names fetched...')
    invoices = invoices.filter(invoice => {
      return invoice.total > 0 && !!invoice.paid
    })
    const result = invoices.reduce((result, invoice) => {
      const coupon = keypather.get(invoice, 'discount.coupon.id')
      const plan = keypather.get(invoice, 'lines.data[0].plan.name')
      const userQuantity = keypather.get(invoice, 'lines.data[0].quantity')
      const users = keypather.get(invoice, 'lines.data[0].metadata.users')
      return result.concat([[
        invoice.date,
        invoice.customer,
        invoice.organizationName,
        plan, // plan
        userQuantity,
        invoice.subtotal, // total
        invoice.total, // total
        coupon,
        users
      ]])
    }, [['Date', 'Stripe Customer ID', 'Customer Name', 'Plan', 'User Count', 'Subtotal', 'Total amount paid', 'Dicsount', 'Users']])
    return Promise.fromCallback(cb => csvStringify(result, cb))
  })
  .then(csvString => {
    console.log('Writing file...')
    const fileName = `${__dirname}/invoice-report-${Date.now()}.csv`
    fs.appendFileSync(fileName, csvString)
    console.log(`Done. CSV save to ${fileName}`)
  })
  .catch(err => {
    console.log('ERR', err)
  })
