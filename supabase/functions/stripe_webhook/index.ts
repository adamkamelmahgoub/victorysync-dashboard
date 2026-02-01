import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno';
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    });

    const body = await req.text();
    const sig = req.headers.get('stripe-signature')!;
    const endpointSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return new Response('Webhook signature verification failed', { status: 400 });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.org_id;
        const plan = session.metadata?.plan;
        const seatCount = parseInt(session.metadata?.seat_count || '1');

        if (orgId && plan) {
          await supabaseClient
            .from('subscriptions')
            .upsert({
              org_id: orgId,
              stripe_customer_id: session.customer,
              stripe_subscription_id: session.subscription,
              plan,
              seat_count: seatCount,
              status: 'active',
              current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // approx
            });

          // Log audit
          await supabaseClient.from('audit_logs').insert({
            org_id: orgId,
            action: 'subscription_created',
            entity_type: 'subscription',
            metadata: { plan, seat_count: seatCount, stripe_session_id: session.id }
          });
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        const { data: subscription } = await supabaseClient
          .from('subscriptions')
          .select('org_id')
          .eq('stripe_subscription_id', subscriptionId)
          .single();

        if (subscription) {
          await supabaseClient
            .from('subscriptions')
            .update({
              status: 'active',
              current_period_end: new Date(invoice.period_end * 1000).toISOString()
            })
            .eq('stripe_subscription_id', subscriptionId);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        const { data: subscription } = await supabaseClient
          .from('subscriptions')
          .select('org_id')
          .eq('stripe_subscription_id', subscriptionId)
          .single();

        if (subscription) {
          await supabaseClient
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', subscriptionId);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;

        const { data: sub } = await supabaseClient
          .from('subscriptions')
          .select('org_id')
          .eq('stripe_subscription_id', subscriptionId)
          .single();

        if (sub) {
          await supabaseClient
            .from('subscriptions')
            .update({
              status: subscription.status,
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              seat_count: subscription.items.data[0]?.quantity || 1
            })
            .eq('stripe_subscription_id', subscriptionId);

          // Log seat changes
          if (subscription.items.data[0]?.quantity) {
            await supabaseClient.from('audit_logs').insert({
              org_id: sub.org_id,
              action: 'seats_updated',
              entity_type: 'subscription',
              metadata: { new_seat_count: subscription.items.data[0].quantity }
            });
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;

        const { data: sub } = await supabaseClient
          .from('subscriptions')
          .select('org_id')
          .eq('stripe_subscription_id', subscriptionId)
          .single();

        if (sub) {
          await supabaseClient
            .from('subscriptions')
            .update({ status: 'canceled' })
            .eq('stripe_subscription_id', subscriptionId);

          await supabaseClient.from('audit_logs').insert({
            org_id: sub.org_id,
            action: 'subscription_canceled',
            entity_type: 'subscription'
          });
        }
        break;
      }

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});