module.exports = {
  'id': 'in_18lPpbLYrJgOrBWza8vZ6ube',
  'object': 'invoice',
  'amount_due': 900,
  'application_fee': null,
  'attempt_count': 1,
  'attempted': true,
  'charge': 'ch_18lPpbLYrJgOrBWzcOj0btM3',
  'closed': true,
  'currency': 'usd',
  'customer': 'cus_93Wtm3jOX5MrRB',
  'date': 1471900783,
  'description': null,
  'discount': null,
  'ending_balance': 0,
  'forgiven': false,
  'lines': {
    'object': 'list',
    'data': [
      {
        'id': 'sub_93Wtbu4oKGq3P3',
        'object': 'line_item',
        'amount': 900,
        'currency': 'usd',
        'description': null,
        'discountable': true,
        'livemode': false,
        'metadata': {},
        'period': {
          'start': 1471900783,
          'end': 1474579183
        },
        'plan': {
          'id': 'runnable-starter',
          'object': 'plan',
          'amount': 900,
          'created': 1471900633,
          'currency': 'usd',
          'interval': 'month',
          'interval_count': 1,
          'livemode': false,
          'metadata': {},
          'name': 'Starter',
          'statement_descriptor': null,
          'trial_period_days': 14
        },
        'proration': false,
        'quantity': 1,
        'subscription': null,
        'type': 'subscription'
      }
    ],
    'has_more': false,
    'total_count': 1,
    'url': '/v1/invoices/in_18lPpbLYrJgOrBWza8vZ6ube/lines'
  },
  'livemode': false,
  'metadata': {
    'paymentMethodOwnerId': '76',
    'paymentMethodOwnerGithubId': '1981198'
  },
  'next_payment_attempt': null,
  'paid': true,
  'period_end': 1471900783,
  'period_start': 1471900783,
  'receipt_number': null,
  'starting_balance': 0,
  'statement_descriptor': null,
  'subscription': 'sub_93Wtbu4oKGq3P3',
  'subtotal': 900,
  'tax': null,
  'tax_percent': null,
  'total': 900,
  'webhooks_delivered_at': 1471900783
}
