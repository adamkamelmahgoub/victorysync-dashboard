-- 032_stripe_billing_integration.sql
-- Stripe-aware billing metadata for VictorySync billing tables.

alter table public.billing_plans
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id text,
  add column if not exists currency text default 'USD',
  add column if not exists billing_interval text default 'month';

alter table public.org_subscriptions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean default false,
  add column if not exists seats integer default 1,
  add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.invoices
  add column if not exists stripe_invoice_id text,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_hosted_invoice_url text,
  add column if not exists stripe_invoice_pdf text,
  add column if not exists currency text default 'USD',
  add column if not exists subtotal numeric(12, 2),
  add column if not exists amount_due numeric(12, 2),
  add column if not exists amount_paid numeric(12, 2);

alter table public.billing_records
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_invoice_id text;

alter table public.payment_transactions
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_invoice_id text,
  add column if not exists currency text default 'USD';

create index if not exists idx_billing_plans_stripe_price_id on public.billing_plans(stripe_price_id);
create index if not exists idx_org_subscriptions_stripe_customer_id on public.org_subscriptions(stripe_customer_id);
create index if not exists idx_org_subscriptions_stripe_subscription_id on public.org_subscriptions(stripe_subscription_id);
create unique index if not exists idx_invoices_stripe_invoice_id_unique
  on public.invoices(stripe_invoice_id)
  where stripe_invoice_id is not null;
create index if not exists idx_billing_records_stripe_invoice_id on public.billing_records(stripe_invoice_id);
create index if not exists idx_invoices_stripe_checkout_session_id on public.invoices(stripe_checkout_session_id);
create index if not exists idx_invoices_stripe_payment_intent_id on public.invoices(stripe_payment_intent_id);
create index if not exists idx_payment_transactions_stripe_payment_intent_id on public.payment_transactions(stripe_payment_intent_id);
