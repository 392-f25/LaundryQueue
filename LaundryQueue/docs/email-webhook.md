# Email Webhook Integration

This project keeps the front-end deployable as a static site. To deliver real emails you can run the bundled webhook server and point the app to it.

## 1. Configure environment variables

Copy `.env.example` to `.env` (or export the variables in your shell) and fill out the SMTP credentials for the mailbox you want to send from:

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
EMAIL_FROM="Laundry Queue <no-reply@example.com>"
EMAIL_WEBHOOK_TOKEN=super-secret-string
VITE_EMAIL_WEBHOOK_URL=http://localhost:8787/notify
VITE_EMAIL_WEBHOOK_TOKEN=super-secret-string
```

> Use the same token value for `EMAIL_WEBHOOK_TOKEN` and `VITE_EMAIL_WEBHOOK_TOKEN` so the webhook can authenticate requests coming from the browser.

## 2. Install dependencies

```bash
npm install
```

## 3. Start the webhook server

```bash
npm run email:webhook
```

The server listens on `PORT` (defaults to `8787`) and exposes:

- `POST /notify` – Expecting the notification payload forwarded by the front-end. Sends an email through your SMTP provider.
- `GET /health` – Simple health check endpoint.

## 4. Run the Vite dev server

With the webhook running and environment variables present, start the UI:

```bash
npm run dev
```

When a machine finishes or someone sends a reminder, the client still writes the notification to the mock database, but it also POSTs the payload to the webhook URL. The webhook uses Nodemailer to deliver the email.

If you deploy the webhook elsewhere, update `VITE_EMAIL_WEBHOOK_URL` to point at the hosted endpoint.

## Notes

- Because the webhook token is exposed to the client (it starts with `VITE_`), choose a value that is unique but rotate it periodically.
- For production you can place the webhook behind something like Cloudflare Workers, AWS Lambda, or Firebase Functions. The same payload contract applies, so the front-end changes remain the same.
- The webhook logs errors to stdout; check your terminal if an email is not delivered.
