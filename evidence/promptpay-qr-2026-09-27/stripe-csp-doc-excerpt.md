# Source: https://docs.stripe.com/security/guide.md fetched 2026-09-27 (lines 66-93 verbatim)

### Content Security Policy

If you’ve deployed a *Content Security Policy* (Content Security Policy (CSP) is an added layer of security that helps to detect and mitigate certain types of attacks, including Cross-Site Scripting (XSS) and data injection attacks), the full set of directives for Stripe products are:

#### Checkout

- `connect-src`, `https://checkout.stripe.com`
- `frame-src`, `https://checkout.stripe.com`
- `script-src`, `https://checkout.stripe.com`
- `img-src`, `https://*.stripe.com`

#### Connect embedded components

- `frame-src`, `https://connect-js.stripe.com`, `https://js.stripe.com`
- `img-src`, `https://*.stripe.com`
- `script-src`, `https://connect-js.stripe.com`, `https://js.stripe.com`
- `style-src`, `sha256-0hAheEzaMe6uXIKV4EehS9pu1am1lj/KnnzrOYqckXk=` (SHA of empty style element)

If you’re using a CSS file to load [web fonts](https://docs.stripe.com/connect/get-started-connect-embedded-components.md#fonts-object) for use with Connect embedded components, its URL must be allowed by your [connect-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/connect-src) CSP directive.

#### Stripe.js

- `connect-src`, `https://api.stripe.com`, `https://maps.googleapis.com`
- `frame-src`, `https://*.js.stripe.com`, `https://js.stripe.com`, `https://hooks.stripe.com`
- `script-src`, `https://*.js.stripe.com`, `https://js.stripe.com`, `https://maps.googleapis.com`

> Adding `*.js.stripe.com` allows Stripe.js to improve performance by starting frames on different origins, where possible.

