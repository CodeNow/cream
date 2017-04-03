var stripe = require("stripe")(
  "sk_test_4De8Zdkfcyb29swkMmjZUMRh"
);

stripe.subscriptions.list(
  { limit: 1 },
  function(err, accounts) {
    console.log(err, accounts)
    console.log(accounts.data[0].metadata)
    console.log(accounts.data[0].plan)
  }
);
