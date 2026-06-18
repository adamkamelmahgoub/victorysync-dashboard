# VictorySync Email Notifications

VictorySync sends dashboard and billing notification emails from the backend only. Frontend code never receives the email provider key.

## Provider

The current implementation supports Resend through the HTTPS API.

Required backend environment variables:

```env
EMAIL_NOTIFICATIONS_ENABLED=true
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_replace-with-resend-api-key
EMAIL_FROM=VictorySync <notifications@victorysync.com>
EMAIL_REPLY_TO=support@victorysync.com
EMAIL_ADMIN_TO=adam@victorysync.com
EMAIL_APP_URL=https://dashboard.victorysync.com
EMAIL_NOTIFY_DASHBOARD_UPDATES=true
```

## Events Sent

- New invoice created from the admin billing page.
- Manual payment reminder for open invoices.
- Stripe Checkout card payment completed.
- Stripe invoice paid/payment succeeded.
- Stripe invoice payment failed.
- Stripe subscription created, updated, or deleted.
- Successful dashboard data mutations when `EMAIL_NOTIFY_DASHBOARD_UPDATES=true`.

## Recipient Rules

- Billing emails go to billing/admin/manager recipients found in `org_members` or `org_users`, plus platform admin fallback recipients.
- Platform admin fallback recipients come from `EMAIL_ADMIN_TO` and platform admin profiles when available.
- Emails are deduplicated and capped to avoid runaway recipient lists.

## Safety

- Request bodies, card details, API keys, tokens, recording URLs, and secrets are never included in dashboard update emails.
- If email is disabled or the provider key is missing, the API call continues and the email is skipped safely.
- Stripe webhook processing does not fail just because a notification email cannot be sent.

## Testing

1. Configure the environment variables above in the backend host.
2. Create an invoice in Admin Billing and confirm the invoice email arrives.
3. Use **Send reminder** on an open invoice and confirm the reminder arrives.
4. Complete a Stripe Checkout payment and confirm the payment email arrives after the webhook is delivered.
5. Trigger a subscription update in Stripe and confirm the subscription update email arrives.
