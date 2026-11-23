# SalonBook – Server

REST API for **SalonBook** (salon appointment booking platform) built with Express.js, MongoDB, JWT verification and Stripe.

**Live API:** `https://your-server-url.vercel.app`
**Live Website:** `https://your-client-url.vercel.app`
**Client Repository:** `https://github.com/your-username/salonbook-client`
**Server Repository:** `https://github.com/your-username/salonbook-server`

## Important Features

- JWT verification middleware (`verifyJWT`) + `verifyAdmin` / `verifyCustomer` role middleware. The role and blocked status are read from the database, never trusted from the token
- Services API: public list (search, category filter, price sorting), admin add / update / delete / activate
- Appointments API: create with slot-conflict checks, customer cancel (own & pending only), admin confirm / cancel
- Stripe Checkout session creation + **verified webhook** that marks appointments as paid and saves transactions (duplicate-safe)
- Admin APIs: stats, users (block / unblock), transactions (read-only)
- Image upload endpoint (ImgBB) with file type / size limits and rate limiting
- Central error handling and clear JSON error messages

## Technology Stack

Node.js · Express.js · MongoDB (native driver) · jose (JWT) · Stripe · Multer · ImgBB

## Installation Instructions

```bash
git clone https://github.com/your-username/salonbook-server.git
cd salonbook-server
npm install
cp .env.example .env     # then fill in the values
```

## How to Run the Project Locally

```bash
npm run dev            # starts http://localhost:5000
npm run seed           # (optional) adds 12 demo services
npm run make-admin     # promotes ADMIN_EMAIL (after that user signed up on the website)
```

Test Stripe webhooks locally with the Stripe CLI:

```bash
stripe listen --forward-to localhost:5000/api/webhooks/stripe
```

Copy the `whsec_...` secret it prints into `STRIPE_WEBHOOK_SECRET`. Use the test card `4242 4242 4242 4242`.

## Required Environment Variables (names only)

```
PORT
MONGODB_URI
DB_NAME
CLIENT_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
CURRENCY
IMGBB_API_KEY
ADMIN_EMAIL
```

`CLIENT_URL` must be exactly the same as `BETTER_AUTH_URL` in the client (no trailing slash).

## API Overview

| Method | Route | Access |
| --- | --- | --- |
| GET | `/api/services`, `/api/services/categories` | Public |
| GET | `/api/services/:id`, `/api/services/:id/slots` | Logged in |
| POST / PUT / PATCH / DELETE | `/api/services...` | Admin |
| POST | `/api/appointments` | Customer |
| GET | `/api/appointments/my`, `/my/stats`, `/:id` | Customer (own) |
| PATCH | `/api/appointments/:id/cancel` | Customer (own, pending) |
| POST | `/api/payments/checkout-session` | Customer |
| GET | `/api/payments/session/:id`, `/api/payments/my` | Customer |
| POST | `/api/webhooks/stripe` | Stripe only (signature verified) |
| GET / PATCH | `/api/admin/...` | Admin |
| POST | `/api/upload` | Public (rate limited) |

## Deployment (Vercel)

`vercel.json` is included. Add the environment variables in Vercel, deploy, then create a Stripe webhook endpoint pointing to `https://<your-server>/api/webhooks/stripe` with the events `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`.
