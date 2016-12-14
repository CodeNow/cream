# C.R.E.A.M.

*Payments Service For Runnable*

## Data Source Of Truth

Stripe is the source of truth for all most data handled by Cream. There are some
exceptions where Cream will update data on Big Poppa based events from Stripe,
specifically related to subscriptions (trials, active period, etc.).

_Important_: In the future, we'll be changing the source of truth for a data
handled by Cream to be handled by an internal database. This data should enhance
the data handled by Big Poppa in the same way we currently use Stripe metadata.

## Testing

### Testing commands

There are several testing commands:

- `npm test`: Lints code and runs unit and functional tests
- `npm run test-unit`: Runs only unit tests.
- `npm run test-integration`: Runs only integration tests.
- `npm run test-integration-slow`: Runs tests that take more than 2 min to complete (related to invoice creation). These don't run by default.

### Testing Definitions

There are three types of tests in this project:

- Unit tests: Tests units of codes and stubs out any external code.
- Integration tests: Tests workers and routes against the Stripe API.

## Future Changes

1. Switch to Docker 1.12
1. Strip out `jobIntervals` into its own container/or use khronos time.passed
1. Change source of truth for data to be an internal database (away from Stripe)
