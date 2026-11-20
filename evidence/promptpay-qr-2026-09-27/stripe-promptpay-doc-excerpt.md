# Source: https://docs.stripe.com/payments/promptpay/accept-a-payment.md?payment-ui=direct-api fetched 2026-09-27 (lines 91-183 verbatim)


## Collect payment method details [Client-side]

Create a payment form on your client to collect the required billing details from the customer:

| Field   | Value                                   |
| ------- | --------------------------------------- |
| `email` | The full email address of the customer. |

```html
<form id="payment-form">
  <div class="form-row">
    <label for="email">
      Email
    </label>
    <input id="email" name="email" required>
  </div>

  <!-- Used to display form errors. -->
  <div id="error-message" role="alert"></div>

  <button id="submit-button">Pay with PromptPay</button>
</form>
```

## Display the PromptPay QR Code [Client-side]

In this step, you’ll complete PromptPay payments on the client with [Stripe.js](https://docs.stripe.com/payments/elements.md). Include the Stripe.js script on your checkout page by adding it to the `head` of your HTML file.

#### HTML

```html
<head>
  <title>Checkout</title>
  <script src="https://js.stripe.com/dahlia/stripe.js"></script>
</head>
```

Create an instance of Stripe.js with the following JavaScript snippet on your checkout page.

#### JavaScript

```js
// Set your publishable key. Remember to change this to your live publishable key in production!
// See your keys here: https://dashboard.stripe.com/apikeys
const stripe = Stripe('<<YOUR_PUBLISHABLE_KEY>>');
```

Use `stripe.confirmPromptPayPayment` to confirm the payment on the client side.

#### JavaScript

```js
const form = document.getElementById('payment-form');

form.addEventListener('submit', function(event) {
  event.preventDefault();

  // Set the clientSecret here you got in Step 2
  stripe.confirmPromptPayPayment(
    clientSecret,
    {
      payment_method: {
        type: 'promptpay',
        billing_details: {
          email: document.getElementById('email').value,
        },
      },
    })
    // Stripe.js will open a modal to display the PromptPay QR Code to your customer
  .then((res) => {
    if(res.paymentIntent.status === 'succeeded') {
      // The user scanned the QR code
    } else {
      // The user closed the modal, cancelling payment
    }
  });
});
```

After calling `confirmPromptPayPayment`, a QR code displays on the webpage. Your customers can scan the QR code and authenticate the payment using their preferred banking app or payment app. A few seconds after customers authenticate the payment successfully, the QR code window closes automatically and you can [fulfill the order](https://docs.stripe.com/payments/promptpay/accept-a-payment.md#fulfill-order).

## Fulfill the order [Server-side]

[Use a method such as webhooks](https://docs.stripe.com/payments/payment-intents/verifying-status.md#webhooks) to handle order *fulfillment* (Fulfillment is the process of providing the goods or services purchased by a customer, typically after payment is collected), instead of relying on your customer to return to the payment status page. When a customer completes payment, the `PaymentIntent` transitions to `succeeded` and emits the [payment_intent.succeeded](https://docs.stripe.com/api/events/types.md#event_types-payment_intent.succeeded) *webhook* (A webhook is a real-time push notification sent to your application as a JSON payload through HTTPS requests) event.

## Test your integration

*Sandboxes* (A sandbox is an isolated test environment that allows you to test Stripe functionality in your account without affecting your live integration. Use sandboxes to safely experiment with new features and changes) have a **Simulate scan** button that replaces the QR code. The button opens a Stripe-hosted PromptPay test payment page where you can either authorise or fail the test payment.

If you’re not using Stripe.js or another Stripe-hosted solution to display the QR code, scan the QR code with a QR code scanning application on your mobile device. The QR code payload contains a URL that brings you the same PromptPay test payment page.

In live mode, you can scan the QR code using a preferred banking app or payment app that supports PromptPay.
