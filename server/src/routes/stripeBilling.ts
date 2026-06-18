import express, { type Request, type Response } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { isOrgAdmin, isOrgManagerWith, isOrgMember, isPlatformAdmin } from '../auth/rbac';
import { supabaseAdmin } from '../lib/supabaseClient';

const router = express.Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) throw new Error('stripe_not_configured');
  return new Stripe(key);
}

function frontendUrl(path: string) {
  const base = process.env.STRIPE_APP_URL || process.env.FRONTEND_ORIGIN || process.env.APP_URL || process.env.DASHBOARD_URL || 'https://dashboard.victorysync.com';
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function centsToAmount(cents: number | null | undefined) {
  return Number(((Number(cents || 0) || 0) / 100).toFixed(2));
}

function normalizeCurrency(currency: string | null | undefined) {
  return String(currency || 'usd').toUpperCase();
}

function amountToCents(amount: number) {
  return Math.round(Number(amount || 0) * 100);
}

function stripeId(value: unknown) {
  if (!value) return null;
  return typeof value === 'string' ? value : String((value as any).id || '') || null;
}

async function getActorId(req: Request) {
  return String((req as any).actorId || req.header('x-user-id') || '').trim() || null;
}

async function getUserOrgIds(userId: string) {
  const ids = new Set<string>();
  const [orgUsers, orgMembers] = await Promise.all([
    supabaseAdmin.from('org_users').select('org_id').eq('user_id', userId),
    supabaseAdmin.from('org_members').select('org_id').eq('user_id', userId),
  ]);
  for (const row of orgUsers.data || []) if ((row as any).org_id) ids.add(String((row as any).org_id));
  for (const row of orgMembers.data || []) if ((row as any).org_id) ids.add(String((row as any).org_id));
  return Array.from(ids);
}

async function resolveBillingOrgId(userId: string, requestedOrgId?: string | null) {
  if (requestedOrgId) {
    if (await isPlatformAdmin(userId)) return requestedOrgId;
    if (await isOrgMember(userId, requestedOrgId)) return requestedOrgId;
    return null;
  }
  const ids = await getUserOrgIds(userId);
  return ids[0] || null;
}

async function canManageBilling(userId: string, orgId: string) {
  return (
    (await isPlatformAdmin(userId)) ||
    (await isOrgAdmin(userId, orgId)) ||
    (await isOrgManagerWith(userId, orgId, 'can_view_billing'))
  );
}

async function getOrg(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

async function getUserEmail(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle();
  if ((profile as any)?.email) return String((profile as any).email);
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data?.user?.email || undefined;
}

async function getSubscription(orgId: string) {
  const { data, error } = await supabaseAdmin
    .from('org_subscriptions')
    .select('*, billing_plans(*)')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

async function getPlan(planId: string) {
  const { data, error } = await supabaseAdmin
    .from('billing_plans')
    .select('*')
    .eq('id', planId)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

function fallbackPriceForPlan(plan: any) {
  const slug = String(plan?.name || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return process.env[`STRIPE_PRICE_${slug}`] || process.env.STRIPE_DEFAULT_PRICE_ID || null;
}

async function getOrCreateCustomer(stripe: any, orgId: string, userId: string) {
  const [org, sub] = await Promise.all([getOrg(orgId), getSubscription(orgId).catch(() => null)]);
  const existing = sub?.stripe_customer_id || null;
  if (existing) {
    try {
      const customer = await stripe.customers.retrieve(existing);
      if (!(customer as any).deleted) return String(customer.id);
    } catch {
      // Customer was deleted or unavailable; create a fresh one below.
    }
  }

  const email = await getUserEmail(userId);
  const customer = await stripe.customers.create({
    email,
    name: org?.name || undefined,
    metadata: { org_id: orgId },
  });

  await upsertOrgSubscription({
    org_id: orgId,
    stripe_customer_id: customer.id,
    status: sub?.status || 'incomplete',
    plan_id: sub?.plan_id || sub?.billing_plans?.id || null,
  });

  return customer.id;
}

async function upsertOrgSubscription(payload: Record<string, any>) {
  const fullPayload = {
    ...payload,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin
    .from('org_subscriptions')
    .upsert(fullPayload, { onConflict: 'org_id' })
    .select()
    .maybeSingle();

  if (!error) return data;

  if (String(error.message || '').toLowerCase().includes('column')) {
    const minimal: Record<string, any> = {
      org_id: payload.org_id,
      status: payload.status || 'active',
      plan_id: payload.plan_id,
      next_billing_date: payload.next_billing_date,
      auto_renew: payload.auto_renew,
    };
    Object.keys(minimal).forEach((key) => minimal[key] === undefined && delete minimal[key]);
    const retry = await supabaseAdmin
      .from('org_subscriptions')
      .upsert(minimal, { onConflict: 'org_id' })
      .select()
      .maybeSingle();
    if (retry.error) throw retry.error;
    return retry.data;
  }

  throw error;
}

async function insertBillingRecord(payload: Record<string, any>) {
  const enriched: Record<string, any> = {
    type: 'subscription',
    status: 'paid',
    currency: 'USD',
    amount: 0,
    billing_date: new Date().toISOString(),
    metadata: {},
    ...payload,
  };
  const { error } = await supabaseAdmin.from('billing_records').insert(enriched);
  if (!error) return;
  if (String(error.message || '').toLowerCase().includes('column')) {
    const minimal = {
      org_id: enriched.org_id || null,
      user_id: enriched.user_id || null,
      type: enriched.type,
      description: enriched.description,
      amount: enriched.amount,
      currency: enriched.currency,
      metadata: enriched.metadata,
    };
    const retry = await supabaseAdmin.from('billing_records').insert(minimal);
    if (retry.error) throw retry.error;
    return;
  }
  throw error;
}

async function insertPaymentTransaction(payload: Record<string, any>) {
  const enriched: Record<string, any> = {
    status: 'paid',
    amount: 0,
    currency: 'USD',
    payment_method: 'card',
    provider: 'stripe',
    processed_at: new Date().toISOString(),
    metadata: {},
    ...payload,
  };

  const { error } = await supabaseAdmin.from('payment_transactions').insert(enriched);
  if (!error) return;

  const message = String(error.message || '').toLowerCase();
  if (message.includes('does not exist') || message.includes('schema cache')) return;
  if (message.includes('column')) {
    const minimal = {
      org_id: enriched.org_id || null,
      invoice_id: enriched.invoice_id || null,
      amount: enriched.amount,
      status: enriched.status,
      currency: enriched.currency,
      metadata: enriched.metadata,
    };
    const retry = await supabaseAdmin.from('payment_transactions').insert(minimal);
    if (retry.error && !String(retry.error.message || '').toLowerCase().includes('does not exist')) throw retry.error;
    return;
  }
  throw error;
}

async function getInvoiceForPayment(invoiceId: string) {
  const { data, error } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

async function markInvoicePaidFromCheckout(session: any) {
  const invoiceId = String(session.metadata?.invoice_id || '');
  if (!invoiceId) return null;

  const paidAt = new Date().toISOString();
  const amountPaid = centsToAmount(session.amount_total);
  const paymentIntentId = stripeId(session.payment_intent);
  const updatePayload: Record<string, any> = {
    status: 'paid',
    paid_at: paidAt,
    amount_paid: amountPaid,
    amount_due: 0,
    stripe_customer_id: stripeId(session.customer),
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
    metadata: {
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId,
      paid_via: 'stripe_checkout',
    },
  };

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update(updatePayload)
    .eq('id', invoiceId)
    .select()
    .maybeSingle();
  if (!error) return data as any;

  if (String(error.message || '').toLowerCase().includes('column')) {
    const retry = await supabaseAdmin
      .from('invoices')
      .update({ status: 'paid' })
      .eq('id', invoiceId)
      .select()
      .maybeSingle();
    if (retry.error) throw retry.error;
    return retry.data as any;
  }
  throw error;
}

async function upsertStripeInvoice(invoice: any) {
  const stripeInvoiceId = invoice.id;
  const subscriptionId = typeof (invoice as any).subscription === 'string'
    ? (invoice as any).subscription
    : (invoice as any).subscription?.id || null;
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || null;

  let orgId = String(invoice.metadata?.org_id || '');
  if (!orgId && subscriptionId) {
    const { data } = await supabaseAdmin
      .from('org_subscriptions')
      .select('org_id')
      .eq('stripe_subscription_id', subscriptionId)
      .maybeSingle();
    orgId = String((data as any)?.org_id || '');
  }
  if (!orgId && customerId) {
    const { data } = await supabaseAdmin
      .from('org_subscriptions')
      .select('org_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    orgId = String((data as any)?.org_id || '');
  }
  if (!orgId) return null;

  const status = invoice.status || 'open';
  const currency = normalizeCurrency(invoice.currency);
  const invoiceNumber = invoice.number || stripeInvoiceId;
  const issuedAt = invoice.created ? new Date(invoice.created * 1000).toISOString() : new Date().toISOString();
  const dueAt = invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null;
  const paidAt = invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : null;

  const payload: Record<string, any> = {
    org_id: orgId,
    invoice_number: invoiceNumber,
    status,
    issued_at: issuedAt,
    due_at: dueAt,
    paid_at: paidAt,
    subtotal: centsToAmount(invoice.subtotal),
    total_amount: centsToAmount(invoice.total),
    grand_total: centsToAmount(invoice.total),
    amount_due: centsToAmount(invoice.amount_due),
    amount_paid: centsToAmount(invoice.amount_paid),
    currency,
    stripe_invoice_id: stripeInvoiceId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    stripe_hosted_invoice_url: invoice.hosted_invoice_url,
    stripe_invoice_pdf: invoice.invoice_pdf,
    metadata: { stripe_status: invoice.status, stripe_collection_method: invoice.collection_method },
  };
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .upsert(payload, { onConflict: 'stripe_invoice_id' })
    .select()
    .maybeSingle();
  if (error) {
    if (String(error.message || '').toLowerCase().includes('column')) {
      const minimal = {
        org_id: orgId,
        invoice_number: invoiceNumber,
        status,
        total_amount: centsToAmount(invoice.total),
        stripe_invoice_id: stripeInvoiceId,
        metadata: { stripe_invoice_id: stripeInvoiceId },
      };
      const retry = await supabaseAdmin.from('invoices').upsert(minimal, { onConflict: 'org_id,invoice_number' }).select().maybeSingle();
      if (retry.error) throw retry.error;
      return retry.data;
    }
    throw error;
  }
  return data;
}

async function syncStripeSubscription(subscription: any, fallbackOrgId?: string | null, fallbackPlanId?: string | null) {
  const orgId = String(subscription.metadata?.org_id || fallbackOrgId || '');
  if (!orgId) return;
  const item = subscription.items.data[0] || null;
  const planId = subscription.metadata?.plan_id || fallbackPlanId || undefined;
  const nextBillingDate = (subscription as any).current_period_end
    ? new Date((subscription as any).current_period_end * 1000).toISOString().slice(0, 10)
    : undefined;

  await upsertOrgSubscription({
    org_id: orgId,
    plan_id: planId,
    status: subscription.status,
    stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id,
    stripe_subscription_id: subscription.id,
    stripe_price_id: item?.price?.id,
    current_period_start: (subscription as any).current_period_start ? new Date((subscription as any).current_period_start * 1000).toISOString() : undefined,
    current_period_end: (subscription as any).current_period_end ? new Date((subscription as any).current_period_end * 1000).toISOString() : undefined,
    next_billing_date: nextBillingDate,
    cancel_at_period_end: subscription.cancel_at_period_end,
    seats: item?.quantity || 1,
    auto_renew: !subscription.cancel_at_period_end,
    metadata: { stripe_status: subscription.status },
  });
}

const checkoutSchema = z.object({
  org_id: z.string().uuid().optional(),
  plan_id: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(500).default(1),
});

const paymentSessionSchema = z.object({
  org_id: z.string().uuid().optional(),
  invoice_id: z.string().uuid().optional(),
  amount: z.coerce.number().positive().max(100000).optional(),
  currency: z.string().trim().regex(/^[a-zA-Z]{3}$/).default('USD'),
  description: z.string().trim().min(3).max(180).optional(),
}).refine((value) => Boolean(value.invoice_id || value.amount), {
  message: 'invoice_id or amount is required',
});

router.get('/plans', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('billing_plans')
      .select('*')
      .eq('is_active', true)
      .order('base_monthly_cost', { ascending: true });
    if (error) throw error;
    res.json({ plans: data || [], stripe_configured: Boolean(process.env.STRIPE_SECRET_KEY) });
  } catch (err: any) {
    res.status(500).json({ error: 'stripe_plans_failed', detail: err?.message || 'Unable to load plans' });
  }
});

router.post('/checkout-session', async (req, res) => {
  try {
    const actorId = await getActorId(req);
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    const parsed = checkoutSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'invalid_checkout_request' });

    const orgId = await resolveBillingOrgId(actorId, parsed.data.org_id || null);
    if (!orgId) return res.status(403).json({ error: 'forbidden' });
    if (!(await canManageBilling(actorId, orgId))) return res.status(403).json({ error: 'forbidden' });

    const plan = await getPlan(parsed.data.plan_id);
    if (!plan || plan.is_active === false) return res.status(404).json({ error: 'plan_not_found' });
    const stripePriceId = plan.stripe_price_id || fallbackPriceForPlan(plan);
    if (!stripePriceId) return res.status(400).json({ error: 'stripe_price_missing', message: 'Add a Stripe price ID to this billing plan before starting Checkout.' });

    const stripe = getStripe();
    const customerId = await getOrCreateCustomer(stripe, orgId, actorId);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: stripePriceId, quantity: parsed.data.quantity }],
      success_url: frontendUrl('/billing?stripe=success'),
      cancel_url: frontendUrl('/billing?stripe=cancelled'),
      allow_promotion_codes: true,
      client_reference_id: orgId,
      metadata: {
        org_id: orgId,
        plan_id: plan.id,
        plan_name: plan.name || '',
        user_id: actorId,
      },
      subscription_data: {
        metadata: {
          org_id: orgId,
          plan_id: plan.id,
          plan_name: plan.name || '',
        },
      },
    });

    await upsertOrgSubscription({
      org_id: orgId,
      plan_id: plan.id,
      status: 'incomplete',
      stripe_customer_id: customerId,
      stripe_price_id: stripePriceId,
      stripe_checkout_session_id: session.id,
      seats: parsed.data.quantity,
      metadata: { latest_checkout_session_id: session.id },
    });

    res.json({ url: session.url, session_id: session.id });
  } catch (err: any) {
    const status = err?.message === 'stripe_not_configured' ? 503 : 500;
    res.status(status).json({ error: err?.message === 'stripe_not_configured' ? 'stripe_not_configured' : 'stripe_checkout_failed' });
  }
});

router.post('/payment-session', async (req, res) => {
  try {
    const actorId = await getActorId(req);
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    const parsed = paymentSessionSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'invalid_payment_request' });

    let invoice: any = null;
    let orgId = parsed.data.org_id || null;
    let amount = Number(parsed.data.amount || 0);
    let currency = normalizeCurrency(parsed.data.currency);
    let description = parsed.data.description || 'VictorySync payment';

    if (parsed.data.invoice_id) {
      invoice = await getInvoiceForPayment(parsed.data.invoice_id);
      if (!invoice) return res.status(404).json({ error: 'invoice_not_found' });
      orgId = String(invoice.org_id || orgId || '');
      if (!orgId) return res.status(400).json({ error: 'invoice_missing_org' });

      const status = String(invoice.status || '').toLowerCase();
      if (['paid', 'void', 'voided', 'cancelled', 'canceled'].includes(status)) {
        return res.status(409).json({ error: 'invoice_not_payable' });
      }

      amount = Number(invoice.amount_due ?? invoice.total_amount ?? invoice.grand_total ?? invoice.total ?? amount ?? 0);
      currency = normalizeCurrency(invoice.currency || currency);
      description = `VictorySync invoice ${invoice.invoice_number || invoice.id}`;
    } else {
      orgId = await resolveBillingOrgId(actorId, orgId);
    }

    if (!orgId) return res.status(403).json({ error: 'forbidden' });
    if (!(await canManageBilling(actorId, orgId))) return res.status(403).json({ error: 'forbidden' });

    const amountCents = amountToCents(amount);
    if (amountCents < 50) return res.status(400).json({ error: 'amount_too_small' });
    if (amountCents > 10_000_000) return res.status(400).json({ error: 'amount_too_large' });

    const stripe = getStripe();
    const customerId = await getOrCreateCustomer(stripe, orgId, actorId);
    const metadata: Record<string, string> = {
      org_id: orgId,
      user_id: actorId,
      purpose: invoice ? 'invoice_payment' : 'one_time_payment',
    };
    if (invoice?.id) metadata.invoice_id = String(invoice.id);
    if (invoice?.invoice_number) metadata.invoice_number = String(invoice.invoice_number);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: amountCents,
          product_data: {
            name: description,
            metadata: { org_id: orgId },
          },
        },
      }],
      success_url: frontendUrl('/billing?stripe_payment=success'),
      cancel_url: frontendUrl('/billing?stripe_payment=cancelled'),
      client_reference_id: orgId,
      metadata,
      payment_intent_data: { metadata },
      invoice_creation: {
        enabled: true,
        invoice_data: { metadata },
      },
    });

    if (invoice?.id) {
      await supabaseAdmin
        .from('invoices')
        .update({
          stripe_customer_id: customerId,
          stripe_checkout_session_id: session.id,
          metadata: { stripe_checkout_session_id: session.id, payment_status: 'checkout_started' },
        })
        .eq('id', invoice.id)
        .then((result) => {
          if (result.error && !String(result.error.message || '').toLowerCase().includes('column')) throw result.error;
        });
    }

    res.json({ url: session.url, session_id: session.id });
  } catch (err: any) {
    const status = err?.message === 'stripe_not_configured' ? 503 : 500;
    res.status(status).json({ error: err?.message === 'stripe_not_configured' ? 'stripe_not_configured' : 'stripe_payment_session_failed' });
  }
});

const portalSchema = z.object({ org_id: z.string().uuid().optional() });

router.post('/portal-session', async (req, res) => {
  try {
    const actorId = await getActorId(req);
    if (!actorId) return res.status(401).json({ error: 'unauthenticated' });
    const parsed = portalSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'invalid_portal_request' });

    const orgId = await resolveBillingOrgId(actorId, parsed.data.org_id || null);
    if (!orgId) return res.status(403).json({ error: 'forbidden' });
    if (!(await canManageBilling(actorId, orgId))) return res.status(403).json({ error: 'forbidden' });

    const stripe = getStripe();
    const customerId = await getOrCreateCustomer(stripe, orgId, actorId);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: frontendUrl('/billing'),
    });
    res.json({ url: session.url });
  } catch (err: any) {
    const status = err?.message === 'stripe_not_configured' ? 503 : 500;
    res.status(status).json({ error: err?.message === 'stripe_not_configured' ? 'stripe_not_configured' : 'stripe_portal_failed' });
  }
});

export async function stripeWebhookHandler(req: Request, res: Response) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret) return res.status(503).json({ error: 'stripe_webhook_not_configured' });

  let event: any;
  try {
    const stripe = getStripe();
    const signature = String(req.headers['stripe-signature'] || '');
    event = stripe.webhooks.constructEvent(req.body, signature, secret);
  } catch {
    return res.status(400).send('Invalid Stripe webhook signature');
  }

  try {
    const stripe = getStripe();
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const orgId = session.metadata?.org_id || session.client_reference_id || null;
        const planId = session.metadata?.plan_id || null;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || null;
        if (session.mode === 'payment') {
          const localInvoice = await markInvoicePaidFromCheckout(session);
          const resolvedOrgId = orgId || (localInvoice as any)?.org_id || null;
          if (resolvedOrgId) {
            await insertPaymentTransaction({
              org_id: resolvedOrgId,
              invoice_id: session.metadata?.invoice_id || null,
              amount: centsToAmount(session.amount_total),
              currency: normalizeCurrency(session.currency),
              status: session.payment_status === 'paid' ? 'paid' : session.payment_status,
              stripe_payment_intent_id: stripeId(session.payment_intent),
              stripe_invoice_id: stripeId(session.invoice),
              stripe_customer_id: stripeId(session.customer),
              metadata: {
                stripe_event: event.type,
                stripe_session_id: session.id,
                purpose: session.metadata?.purpose || 'payment',
              },
            });
            await insertBillingRecord({
              org_id: resolvedOrgId,
              user_id: session.metadata?.user_id || null,
              type: 'payment',
              description: session.metadata?.invoice_number
                ? `Stripe card payment for invoice ${session.metadata.invoice_number}`
                : 'Stripe card payment',
              amount: centsToAmount(session.amount_total),
              currency: normalizeCurrency(session.currency),
              status: session.payment_status === 'paid' ? 'paid' : session.payment_status,
              stripe_customer_id: stripeId(session.customer),
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: stripeId(session.payment_intent),
              stripe_invoice_id: stripeId(session.invoice),
              metadata: {
                stripe_event: event.type,
                stripe_session_id: session.id,
                invoice_id: session.metadata?.invoice_id || null,
                purpose: session.metadata?.purpose || 'payment',
              },
            });
          }
        } else if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncStripeSubscription(subscription, orgId, planId);
        } else if (orgId) {
          await upsertOrgSubscription({
            org_id: orgId,
            plan_id: planId,
            status: session.payment_status === 'paid' ? 'active' : session.status || 'complete',
            stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id,
            stripe_checkout_session_id: session.id,
          });
        }
        if (orgId && session.mode !== 'payment') {
          await insertBillingRecord({
            org_id: orgId,
            user_id: session.metadata?.user_id || null,
            type: 'subscription',
            description: `Stripe Checkout completed${session.metadata?.plan_name ? ` - ${session.metadata.plan_name}` : ''}`,
            amount: centsToAmount(session.amount_total),
            currency: normalizeCurrency(session.currency),
            status: session.payment_status === 'paid' ? 'paid' : session.payment_status,
            stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id,
            stripe_checkout_session_id: session.id,
            metadata: { stripe_event: event.type, stripe_session_id: session.id },
          });
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await syncStripeSubscription(event.data.object as any);
        break;
      }
      case 'invoice.created':
      case 'invoice.finalized':
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
      case 'invoice.voided': {
        const invoice = event.data.object as any;
        const localInvoice = await upsertStripeInvoice(invoice);
        if (localInvoice && ['invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed'].includes(event.type)) {
          await insertBillingRecord({
            org_id: (localInvoice as any).org_id,
            type: event.type === 'invoice.payment_failed' ? 'payment' : 'subscription',
            description: `Stripe invoice ${invoice.number || invoice.id}`,
            amount: centsToAmount(invoice.amount_paid || invoice.amount_due || invoice.total),
            currency: normalizeCurrency(invoice.currency),
            status: event.type === 'invoice.payment_failed' ? 'failed' : 'paid',
            stripe_customer_id: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id,
            stripe_invoice_id: invoice.id,
            stripe_subscription_id: typeof (invoice as any).subscription === 'string' ? (invoice as any).subscription : (invoice as any).subscription?.id,
            metadata: { stripe_event: event.type },
          });
        }
        break;
      }
      default:
        break;
    }

    res.json({ received: true });
  } catch (err: any) {
    res.status(500).json({ error: 'stripe_webhook_sync_failed', detail: err?.message || 'Webhook sync failed' });
  }
}

export default router;
