module.exports = {
  'id': 'in_18jwtvLYrJgOrBWzmwaRPS09',
  'object': 'invoice',
  'amount_due': 900,
  'application_fee': null,
  'attempt_count': 1,
  'attempted': true,
  'charge': 'ch_18jwtvLYrJgOrBWzaFu19xHa',
  'closed': true,
  'currency': 'usd',
  'customer': 'cus_920vB5MpzORwlt',
  'date': 1471551247,
  'description': null,
  'discount': null,
  'ending_balance': 0,
  'forgiven': false,
  'lines': {
    'object': 'list',
    'data': [
      {
        'id': 'sub_920vG1OneO9JbA',
        'object': 'line_item',
        'amount': 900,
        'currency': 'usd',
        'description': null,
        'discountable': true,
        'livemode': false,
        'metadata': {},
        'period': {
          'start': 1471551247,
          'end': 1474229647
        },
        'plan': {
          'id': 'runnable-basic',
          'object': 'plan',
          'amount': 900,
          'created': 1470016403,
          'currency': 'usd',
          'interval': 'month',
          'interval_count': 1,
          'livemode': false,
          'metadata': {},
          'name': 'Basic',
          'statement_descriptor': 'Single User - BASIC',
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
    'url': '/v1/invoices/in_18jwtvLYrJgOrBWzmwaRPS09/lines'
  },
  'livemode': false,
  'metadata': {
    'paymentMethodOwnerId': '76',
    'paymentMethodOwnerGithubId': '1981198'
  },
  'next_payment_attempt': null,
  'paid': true,
  'period_end': 1471551247,
  'period_start': 1471551247,
  'receipt_number': null,
  'starting_balance': 0,
  'statement_descriptor': null,
  'subscription': 'sub_920vG1OneO9JbA',
  'subtotal': 900,
  'tax': null,
  'tax_percent': null,
  'total': 900,
  'webhooks_delivered_at': 1471551247
}
