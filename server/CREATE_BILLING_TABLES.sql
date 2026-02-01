-- Add billing and invoicing tables to CREATE_MIGHTYCALL_TABLES.sql

-- Invoices Table
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  billing_period_start date,
  billing_period_end date,
  total_amount numeric(12, 2),
  tax_amount numeric(12, 2),
  grand_total numeric(12, 2),
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoices_org_id ON public.invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issued_at ON public.invoices(issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_org_status ON public.invoices(org_id, status);

-- Invoice Line Items
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text,
  service_code text,
  quantity numeric(10, 2),
  unit_price numeric(12, 2),
  line_total numeric(12, 2),
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id ON public.invoice_line_items(invoice_id);

-- Usage/Charges Table (for tracking actual usage)
CREATE TABLE IF NOT EXISTS public.usage_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  charge_type text NOT NULL CHECK (charge_type IN ('minutes', 'sms', 'voicemail', 'premium_feature', 'api_call')),
  quantity numeric(10, 2),
  unit_cost numeric(12, 2),
  total_cost numeric(12, 2),
  service_date date,
  billing_period date,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_charges_org_id ON public.usage_charges(org_id);
CREATE INDEX IF NOT EXISTS idx_usage_charges_charge_type ON public.usage_charges(charge_type);
CREATE INDEX IF NOT EXISTS idx_usage_charges_billing_period ON public.usage_charges(billing_period);
CREATE INDEX IF NOT EXISTS idx_usage_charges_org_period ON public.usage_charges(org_id, billing_period);

-- Billing Plans Table
CREATE TABLE IF NOT EXISTS public.billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  base_monthly_cost numeric(12, 2),
  included_minutes integer DEFAULT 0,
  included_sms integer DEFAULT 0,
  overage_minute_cost numeric(12, 4),
  overage_sms_cost numeric(12, 4),
  features jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_plans_active ON public.billing_plans(is_active);

-- Org Subscriptions (which plan is org using)
CREATE TABLE IF NOT EXISTS public.org_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.billing_plans(id),
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  billing_cycle_day integer DEFAULT 1,
  next_billing_date date,
  auto_renew boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_subscriptions_org_id ON public.org_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_plan_id ON public.org_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status ON public.org_subscriptions(status);

-- Payment Methods
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('credit_card', 'bank_account', 'paypal')),
  token text,
  last_four text,
  expiry_month integer,
  expiry_year integer,
  is_default boolean DEFAULT false,
  status text DEFAULT 'active' CHECK (status IN ('active', 'expired', 'failed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_org_id ON public.payment_methods(org_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_is_default ON public.payment_methods(org_id, is_default);

-- Payment Transactions
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  amount numeric(12, 2),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
  transaction_date timestamptz,
  external_id text,
  error_message text,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_org_id ON public.payment_transactions(org_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON public.payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_invoice_id ON public.payment_transactions(invoice_id);
