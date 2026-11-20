# Tenacity quotation, orders and M-Pesa setup

## Required Vercel environment variables

The existing Daraja variables remain in use:
- `MPESA_CONSUMER_KEY`
- `MPESA_CONSUMER_SECRET`
- `MPESA_SHORTCODE`
- `MPESA_PASSKEY`
- `MPESA_CALLBACK_URL` (must be the public HTTPS URL ending in `/api/mpesa-callback`)
- Optional: `MPESA_ENV=production` or `sandbox`

Persistent orders require a Redis-compatible REST database. Add either pair to Vercel (Production and Preview as appropriate):
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, or
- `KV_REST_API_URL` + `KV_REST_API_TOKEN`

Set `TENACITY_ORDER_ADMIN_TOKEN` to a long random secret. This protects the quotation-confirmation action. Never put it in browser code.

## Workflow

1. A customer adds catalogue items and submits a quotation request. `POST /api/orders` stores a persistent `quote_requested` record and returns a `TL-YYYYMMDD-XXXXX` reference.
2. A trusted staff tool/admin process confirms availability and the total with `POST /api/orders`, JSON `{ "action": "confirm", "orderNumber": "…", "amount": 12500 }`, and header `x-admin-token: <TENACITY_ORDER_ADMIN_TOKEN>`.
3. The customer looks up the order using the order number and the phone number submitted with the quote.
4. Only an order with status `confirmed` can initiate an STK push. The amount is read from the saved order; the browser cannot set or override it.
5. Daraja callback maps its CheckoutRequestID back to the order and persists paid/failed status and receipt metadata.

## Important

The quote-request and order-lookup UI is public. The confirmation action is intentionally API-protected; a proper staff dashboard with authenticated staff accounts should be added before handing day-to-day quotation management to non-technical staff. Do not expose the admin token in a frontend variable or public repository.
