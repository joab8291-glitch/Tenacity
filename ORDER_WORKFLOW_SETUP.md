# Tenacity quotation, order management and M-Pesa setup

This repository's current implementation uses the shared Redis helper in `api/_lib/store.js`. Use the routes below; older `/api/orders` instructions are obsolete.

## Vercel environment variables

Configure these in the Vercel project for each environment you intend to test:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `TENACITY_ORDER_ADMIN_TOKEN` — a long, random secret. Keep it server-side; enter it only in the private order desk at `/admin.html`.
- `MPESA_CONSUMER_KEY`
- `MPESA_CONSUMER_SECRET`
- `MPESA_SHORTCODE`
- `MPESA_PASSKEY`
- `MPESA_CALLBACK_URL` — public HTTPS URL ending in `/api/mpesa-callback`
- Optional: `MPESA_ENV=production` or `sandbox`; `MPESA_BASE_URL` can override the Daraja base URL.

The Upstash URL and token must belong to the same Redis database. Do not commit credentials or expose them in browser-side variables.

## Customer quotation and order tracking

1. The catalogue quotation form sends `POST /api/quote` with customer details, items, quantities and optional notes.
2. The API stores the quotation in Redis for 180 days and returns an order number in the `TL-YYMMDD-XXXXX` format.
3. The customer can look up the order using `GET /api/order?orderNumber=...`.

## Staff order desk

Open `/admin.html`. Enter the `TENACITY_ORDER_ADMIN_TOKEN` value configured in Vercel.

- `GET /api/admin/orders` lists recent quotation requests.
- `PATCH /api/admin/orders` updates an order. Send `Authorization: Bearer <token>`.
- To approve a quotation, send JSON with `orderNumber`, `status: "approved"` and a whole-number `amount` in KES.
- Other supported statuses are `rejected` and `fulfilled`.

Approval stores the confirmed amount on the server-side order record. The customer cannot choose or override the payable amount.

## Order-linked M-Pesa

The customer initiates payment through `POST /api/mpesa` with `action: "initiate"`, the order number and a Kenyan phone number. The API reads the approved amount from Redis and rejects orders that are not approved or are already paid.

Safaricom posts the result to `/api/mpesa-callback`. The callback maps the CheckoutRequestID to the saved order and records the payment result, receipt and confirmed amount. A successful STK request is not itself proof of payment; rely on the callback-updated order status.

## Deployment and verification

After changing environment variables, redeploy the Vercel project. Verify the staff desk can load orders, approve a test quotation, look up that order as a customer, and complete an end-to-end Daraja payment using an approved test order. Do not describe live payments as verified until the callback has been received and the order shows payment confirmed.
