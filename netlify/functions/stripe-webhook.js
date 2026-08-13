// netlify/functions/stripe-webhook.js
// Handles Stripe webhook events — upgrades user plan in Supabase on payment

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-03-31.basil' })
  const sig = event.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  let stripeEvent
  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret)
  } catch (err) {
    console.error('Webhook signature failed:', err.message)
    return { statusCode: 400, body: 'Webhook signature verification failed' }
  }

  // Supabase client (service role — can write to any table)
  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  try {
    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object
      const plan = session.metadata && session.metadata.plan
      const customerId = session.customer
      const subscriptionId = session.subscription

      // ── CLUB PLAN — activates the clubs row created in create-checkout.js.
      // Every member who later joins this club (via club_members) gets free
      // access — nothing further to write per-member here.
      if (plan === 'club') {
        const clubId = session.metadata && session.metadata.clubId
        const adminUserId = session.metadata && session.metadata.adminUserId
        if (clubId) {
          const clubUpdate = await supabase.from('clubs').update({
            plan_status: 'active',
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            updated_at: new Date().toISOString()
          }).eq('id', clubId)
          if (clubUpdate.error) {
            console.error('Supabase club activation FAILED:', JSON.stringify(clubUpdate.error))
            return { statusCode: 500, body: 'Failed to activate club' }
          }
          // The person who set up and is paying for the club is also a
          // member of it — without this they'd have paid £1,000/year and
          // still see themselves as "free" until they clicked their own
          // invite link, which is a bad first impression.
          if (adminUserId) {
            const adminMemberUpsert = await supabase.from('club_members').upsert({
              club_id: clubId,
              user_id: adminUserId,
              role: 'admin'
            }, { onConflict: 'club_id,user_id' })
            if (adminMemberUpsert.error) {
              console.error('Supabase admin club_members upsert FAILED:', JSON.stringify(adminMemberUpsert.error))
            }
          }
          console.log('Club activated:', clubId)
        }
        return { statusCode: 200, body: JSON.stringify({ received: true }) }
      }

      // ── INDIVIDUAL PLANS — 'individual' (new £4.99/mo tier) or legacy
      // 'pro' / 'society', unchanged from before.
      const userId = session.metadata && session.metadata.userId
      if (userId && plan) {
        const upsertResult = await supabase.from('user_plans').upsert({
          user_id: userId,
          plan: plan,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status: 'active',
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })
        if (upsertResult.error) {
          console.error('Supabase upsert FAILED:', JSON.stringify(upsertResult.error))
          return { statusCode: 500, body: 'Failed to write plan upgrade to database' }
        }
        console.log('Plan upgraded:', userId, plan)
      }
    }

    if (stripeEvent.type === 'customer.subscription.deleted') {
      const sub = stripeEvent.data.object
      const plan = sub.metadata && sub.metadata.plan

      if (plan === 'club') {
        const clubId = sub.metadata && sub.metadata.clubId
        if (clubId) {
          const cancelClub = await supabase.from('clubs').update({
            plan_status: 'cancelled',
            updated_at: new Date().toISOString()
          }).eq('id', clubId)
          if (cancelClub.error) {
            console.error('Supabase club cancel FAILED:', JSON.stringify(cancelClub.error))
          }
          console.log('Club subscription cancelled:', clubId)
        }
        return { statusCode: 200, body: JSON.stringify({ received: true }) }
      }

      const userId = sub.metadata && sub.metadata.userId
      if (userId) {
        const cancelResult = await supabase.from('user_plans').update({
          plan: 'free',
          status: 'cancelled',
          updated_at: new Date().toISOString()
        }).eq('user_id', userId)
        if (cancelResult.error) {
          console.error('Supabase cancel-update FAILED:', JSON.stringify(cancelResult.error))
        }
        console.log('Plan cancelled:', userId)
      }
    }

    if (stripeEvent.type === 'invoice.payment_failed') {
      const invoice = stripeEvent.data.object
      const customerId = invoice.customer

      const { data: clubData } = await supabase.from('clubs')
        .select('id').eq('stripe_customer_id', customerId).maybeSingle()
      if (clubData) {
        await supabase.from('clubs').update({
          plan_status: 'past_due',
          updated_at: new Date().toISOString()
        }).eq('id', clubData.id)
      } else {
        const { data } = await supabase.from('user_plans')
          .select('user_id').eq('stripe_customer_id', customerId).single()
        if (data) {
          await supabase.from('user_plans').update({
            status: 'payment_failed',
            updated_at: new Date().toISOString()
          }).eq('user_id', data.user_id)
        }
      }
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) }

  } catch (err) {
    console.error('Webhook handler error:', err.message)
    return { statusCode: 500, body: 'Webhook handler failed' }
  }
}
