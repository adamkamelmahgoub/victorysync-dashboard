import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@12.0.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  org_id: string;
  plan: string;
  seat_count: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: RequestBody = await req.json();
    const { org_id, plan, seat_count } = body;

    // Verify user is admin of the org
    const { data: member, error: memberError } = await supabaseClient
      .from('org_users')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', user.id)
      .single();

    if (memberError || !member || !['org_admin', 'org_manager'].includes(member.role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
      apiVersion: '2023-10-16',
    });

    // Get or create customer
    let customer;
    const { data: subscription } = await supabaseClient
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('org_id', org_id)
      .single();

    if (subscription?.stripe_customer_id) {
      customer = await stripe.customers.retrieve(subscription.stripe_customer_id);
    } else {
      const { data: org } = await supabaseClient
        .from('organizations')
        .select('name')
        .eq('id', org_id)
        .single();

      customer = await stripe.customers.create({
        email: user.email,
        name: org?.name,
        metadata: { org_id },
      });
    }

    const prices = {
      starter: Deno.env.get('STRIPE_PRICE_STARTER'),
      growth: Deno.env.get('STRIPE_PRICE_GROWTH'),
      scale: Deno.env.get('STRIPE_PRICE_SCALE'),
    };

    const priceId = prices[plan as keyof typeof prices];
    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Invalid plan' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      line_items: [
        {
          price: priceId,
          quantity: seat_count,
        },
      ],
      mode: 'subscription',
      success_url: `${Deno.env.get('SITE_URL')}/billing?success=true`,
      cancel_url: `${Deno.env.get('SITE_URL')}/billing?canceled=true`,
      metadata: {
        org_id,
        plan,
        seat_count: seat_count.toString(),
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
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