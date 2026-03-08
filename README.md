# Evenix

Evenix is a full-stack event platform with:
- user/admin authentication
- event creation and booking
- Stripe checkout + webhook confirmation
- email and WhatsApp notifications
- admin analytics + audit logs

## 1. Core Features

- Authentication
  - Email/password signup and login
  - Google OAuth login
  - JWT-based API auth
  - Role-based access (`user`, `admin`)
- Events
  - Admin creates and edits events
  - Ticket types/prices/capacity support
  - Soft-delete (archive) and restore
  - Event ownership isolation per admin (`createdBy`)
- Booking & Payments
  - Direct ticket registration
  - Stripe checkout session flow
  - Stripe webhook processing for:
    - `checkout.session.completed`
    - `payment_intent.payment_failed`
    - `charge.refunded`
  - Webhook idempotency via stored Stripe event IDs
- Notifications
  - Email notifications (booking, signup, etc.)
  - WhatsApp notifications via Twilio
  - Twilio status callback endpoint
- Admin Dashboard
  - Event and booking summary
  - Booking status updates
  - Audit logs UI with filters
- Reliability & Security
  - Health endpoints (`/health`, `/health/db`)
  - Structured request logging
  - Central error handling
  - CORS profiles (dev vs production)
  - Helmet security headers
  - Retry + circuit breaker for SMTP/Twilio/Stripe calls

## 2. Tech Stack

- Backend: Node.js, Express 5
- Database: MongoDB (Mongoose)
- Auth: JWT, Passport Google OAuth
- Payments: Stripe
- Email: Nodemailer (SMTP)
- WhatsApp: Twilio API
- Frontend: Static HTML + Tailwind CSS + vanilla JS

## 3. Project Structure

```txt
smart-event-system/
  controllers/         # business logic (auth, events, bookings, admin)
  middleware/          # auth, admin guard, rate limiter, logger, error handler
  models/              # Mongoose models
  routes/              # API route maps
  utils/               # validation, notifications, resilience, audit helpers
  public/              # frontend pages and scripts
  scripts/             # smoke tests, backup/restore, migrations
  tests/               # automated tests
  server.js            # app entry point
```

## 4. Setup

### Prerequisites

- Node 20.x
- MongoDB Atlas database
- (Optional) Google OAuth credentials
- (Optional) Stripe account
- (Optional) SMTP + Twilio credentials

### Install

```bash
npm install
```

### Configure env

Copy `.env.example` to `.env` and fill values.

Important:
- ensure `MONGO_URI` includes database name path (for example `/smart_event_system`)
- never commit real secrets

### Run

```bash
node server.js
```

App default: `http://localhost:5000`

## 5. Environment Variables

Minimum required:
- `MONGO_URI`
- `JWT_SECRET`

Common keys:
- `NODE_ENV`
- `PORT`
- `CLIENT_BASE_URL`
- `CORS_ALLOWED_ORIGINS`
- `ACCESS_TOKEN_EXPIRES_IN`
- `REFRESH_TOKEN_EXPIRES_IN`

Google OAuth:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`

Stripe:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

SMTP:
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `WEB_EMAIL`

Twilio:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`
- `TWILIO_STATUS_CALLBACK_URL`
- `WEB_WHATSAPP_TO`

## 6. API Overview

### Health
- `GET /health`
- `GET /health/db`

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password`
- `POST /api/auth/verify-reset-otp`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`
- `GET /api/auth/me/following`
- `PUT /api/auth/me`
- `GET /api/auth/users/:id/public`
- `POST /api/auth/follow/:id`
- `DELETE /api/auth/follow/:id`
- `GET /auth/google`
- `GET /auth/google/callback`

### Events
- `GET /api/events`
- `GET /api/events/recommendations` (auth required; supports `limit`, optional `near`)
- `POST /api/events/create` (admin)
- `PUT /api/events/:id` (admin owner only)

### Chatbot
- `POST /api/chatbot`
  - body: `{ "message": "..." }`
  - returns: `{ "reply": "...", "recommendedEventIds": ["..."] }`

### Bookings
- `POST /api/bookings/book`
- `POST /api/bookings/register-ticket`
- `POST /api/bookings/waitlist`
- `GET /api/bookings/waitlist`
- `POST /api/bookings/stripe/checkout-session`
- `POST /api/bookings/stripe/confirm-session`
- `POST /api/bookings/stripe/webhook`
- `GET /api/bookings`
- `PATCH /api/bookings/:id/cancel`
- `PATCH /api/bookings/:id/transfer`
- `PATCH /api/bookings/:id/status` (admin)

### Admin
- `GET /api/admin/events`
- `GET /api/admin/bookings` (supports `page`, `pageSize`, `status`, `eventId`)
- `GET /api/admin/event-booking-summary`
- `GET /api/admin/audit-logs` (supports `page`, `pageSize`, `action`, `from`, `to`)
- `GET /api/admin/users` (supports `page`, `pageSize`, `q`, `verified`, `locked`)
- `GET /api/admin/users/:id/action-history` (supports `limit`, returns lock/unlock/verify history for that user)
- `PATCH /api/admin/users/:id/unlock` (accepts optional JSON body: `{ "reason": "..." }`)
- `GET /api/admin/comments` (supports `page`, `pageSize`, `status`, `q`, `eventId`)
- `GET /api/admin/notification-jobs` (supports `page`, `pageSize`, `status`, `channel`; includes dead-letter items)
- `GET /api/admin/promo-codes` (supports `eventId`)
- `POST /api/admin/promo-codes`
- `PATCH /api/admin/promo-codes/:id/toggle`
- `PATCH /api/admin/bookings/:id/check-in`
- `GET /api/admin/events/:id/passes-export` (CSV)
- `POST /api/admin/test-email`
- `POST /api/admin/test-whatsapp`
- `DELETE /api/admin/event/:id` (soft-delete/archive)
- `PATCH /api/admin/event/:id/restore`

### Notifications callback
- `POST /api/notifications/whatsapp-status`

### Live Comments (SSE)
- `GET /api/events/:id/comments/stream` (Server-Sent Events)
- Event names: `comment_created`, `typing`, `viewer_count`
- `POST /api/events/:id/comments/typing` (auth required)

### Calendar Integration
- Event and ticket confirmation pages include:
  - Google Calendar deep link
  - Outlook deep link
  - `.ics` file download (works with Apple Calendar, Outlook desktop, etc.)

### Localization + Timezone
- Homepage supports language + timezone selection (`English`, `Español`, `Français`, `اردو`).
- Date/time rendering in key pages (home, event details, booking, ticket confirmation) uses selected timezone.
- Preferences persist via `localStorage` keys: `app_locale`, `app_timezone`.

### Technical SEO
- `public/robots.txt` allows crawling and points to sitemap.
- Dynamic sitemap route: `GET /sitemap.xml` (includes core pages + published event detail URLs).
- Event detail page injects Event JSON-LD (`schema.org/Event`) for rich results support.

### Organizer Tools UI
- `/organizer-tools.html` (admin-only)
- Includes:
  - Promo code management
  - QR/manual attendee check-in
  - CSV export of event passes

### Notification Queue
- Notification templates are versioned (`templateId`, `templateVersion`) and attached to email headers and queue jobs.
- Async notifications are queued in `NotificationJob` with retries and exponential backoff.
- Dead-letter tracking: jobs move to `dead_letter` after max attempts and keep `lastError` + `deadLetterAt`.
- Immediate sends are still used for critical auth flows (signup OTP, password reset).

### Password Reset UI
- `/forgot-password.html`
- `/verify-otp.html`
- `/reset-password.html`

## 7. Security and Access Rules

- Admin routes use `protect + adminOnly`.
- Event mutation uses owner scoping (`createdBy`).
- Archived events are soft-deleted (`isDeleted=true`).
- Production CORS is strict by domain.
- Helmet is enabled for security headers.
- 500 responses are sanitized.

## 8. Migrations

One-time migration runner:

```bash
npm run migrate:once -- --adminEmail=admin@example.com
```

Force rerun:

```bash
npm run migrate:once -- --adminEmail=admin@example.com --force
```

Included migration:
- `001_backfill_createdBy` (legacy event ownership backfill)

See `MIGRATIONS.md`.

## 9. Backup and Restore

PowerShell scripts:
- `scripts/atlas-backup.ps1`
- `scripts/atlas-restore.ps1`

See `BACKUP_RESTORE.md`.

## 10. Testing

Run tests:

```bash
npm test
```

Current coverage includes:
- auth middleware
- admin role middleware
- stripe webhook config guards

## 11. Troubleshooting

- CORS blocked
  - set `CORS_ALLOWED_ORIGINS` correctly or use dev LAN/local profile
- Mongo uses wrong DB (`test`)
  - include db name in `MONGO_URI` path
- Google OAuth invalid client
  - verify client id/secret and callback URL match Google Console
- Stripe webhook fails
  - set `STRIPE_WEBHOOK_SECRET`
  - send raw body to webhook route
- SMTP invalid login
  - use Gmail app password (no spaces)
- Twilio WhatsApp not delivering
  - verify sandbox join, number format (`+<country><number>`), account limits

## 12. Production Checklist

- rotate all secrets
- set `NODE_ENV=production`
- set strict `CORS_ALLOWED_ORIGINS`
- use production `CLIENT_BASE_URL`
- configure Stripe webhook endpoint + secret
- verify `/health/db` in deployment monitor
- review audit logs in admin dashboard
