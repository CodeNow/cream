'use strict'

module.exports = {
  'id': 'in_18jbDmLYrJgOrBWzwR43ZgoR',
  'object': 'invoice',
  'amount_due': 0,
  'application_fee': null,
  'attempt_count': 0,
  'attempted': true,
  'charge': null,
  'closed': true,
  'currency': 'usd',
  'customer': 'cus_91eWfwFYEfmsi9',
  'date': 1471467910,
  'description': null,
  'discount': null,
  'ending_balance': 0,
  'forgiven': false,
  'lines': {
    'data': [
      {
        'id': 'sub_91eWc3V8HXsJqk',
        'object': 'line_item',
        'amount': 0,
        'currency': 'usd',
        'description': null,
        'discountable': true,
        'livemode': true,
        'metadata': {
        },
        'period': {
          'start': 1471467910,
          'end': 1472677510
        },
        'plan': {
          'id': 'runnable-premium',
          'object': 'plan',
          'amount': 9900,
          'created': 1470016496,
          'currency': 'usd',
          'interval': 'month',
          'interval_count': 1,
          'livemode': false,
          'metadata': {
          },
          'name': 'Premium',
          'statement_descriptor': 'Single user - Premium',
          'trial_period_days': 14
        },
        'proration': false,
        'quantity': 1,
        'subscription': null,
        'type': 'subscription'
      }
    ],
    'total_count': 1,
    'object': 'list',
    'url': '/v1/invoices/in_18jbDmLYrJgOrBWzwR43ZgoR/lines'
  },
  'livemode': false,
  'metadata': {
    'paymentMethodOwnerId': '1',
    'paymentMethodOwnerGithubId': '1981198'
  },
  'next_payment_attempt': null,
  'paid': true,
  'period_end': 1471467910,
  'period_start': 1471467910,
  'receipt_number': null,
  'starting_balance': 0,
  'statement_descriptor': null,
  'subscription': 'sub_91eWc3V8HXsJqk',
  'subtotal': 0,
  'tax': null,
  'tax_percent': null,
  'total': 0,
  'webhooks_delivered_at': 1471467910
}
