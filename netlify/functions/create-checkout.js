// netlify/functions/create-checkout.js
// Creates a Stripe Checkout session for Pro or Society plan

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    }
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-03-31.basil' })
    const { plan, userId, userEmail, clubName } = JSON.parse(event.body || '{}')

    if (!plan || !userId) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing plan or userId' })
      }
    }

    // ── CLUB PLAN — £1,000/year, paid by a club admin, unlocks access
    // for every member of that club (no personal charge to members).
    // 'pro' and 'society' are kept working for any existing subscribers
    // on the old two-tier individual pricing — new individual signups
    // should use 'individual' (£4.99/month, single tier).
    if (plan === 'club') {
      if (!clubName || !clubName.trim()) {
        return {
          statusCode: 400,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Missing clubName' })
        }
      }
      const clubPriceId = process.env.STRIPE_CLUB_PRICE_ID
      if (!clubPriceId) {
        return {
          statusCode: 500,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'STRIPE_CLUB_PRICE_ID not configured' })
        }
      }

      const { createClient } = require('@supabase/supabase-js')
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

      // Slugify the club name for the future public club portal (/club/:slug).
      // If the slug is already taken, fall back to appending a short suffix
      // rather than failing the signup outright.
      const baseSlug = clubName.trim().toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 60) || 'club'
      let slug = baseSlug
      let attempt = 0
      while (attempt < 5) {
        const existing = await supabase.from('clubs').select('id').eq('slug', slug).maybeSingle()
        if (!existing.data) break
        attempt++
        slug = baseSlug + '-' + Math.random().toString(36).slice(2, 6)
      }

      const clubInsert = await supabase.from('clubs').insert({
        name: clubName.trim(),
        slug: slug,
        admin_user_id: userId,
        plan_status: 'pending'
      }).select('id').single()

      if (clubInsert.error || !clubInsert.data) {
        console.error('Club insert failed:', JSON.stringify(clubInsert.error))
        return {
          statusCode: 500,
          headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ error: 'Could not create club record' })
        }
      }

      const clubId = clubInsert.data.id

      const clubSession = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: clubPriceId, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: 'https://gogolftrip.co.uk/?payment=success&plan=club&clubId=' + clubId,
        cancel_url: 'https://gogolftrip.co.uk/?payment=cancelled',
        customer_email: userEmail || undefined,
        metadata: { plan: 'club', clubId: clubId, adminUserId: userId },
        subscription_data: { metadata: { plan: 'club', clubId: clubId, adminUserId: userId } }
      })

      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: clubSession.url })
      }
    }

    // ── INDIVIDUAL PLANS — 'individual' (new, £4.99/mo, single tier)
    // and legacy 'pro' / 'society' (existing subscribers only).
    const priceId = plan === 'individual'
      ? process.env.STRIPE_INDIVIDUAL_PRICE_ID
      : plan === 'society'
        ? process.env.STRIPE_SOCIETY_PRICE_ID
        : process.env.STRIPE_PRO_PRICE_ID

    if (!priceId) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Price ID not configured' })
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: 'https://gogolftrip.co.uk/?payment=success&plan=' + plan,
      cancel_url: 'https://gogolftrip.co.uk/?payment=cancelled',
      customer_email: userEmail || undefined,
      metadata: {
        userId: userId,
        plan: plan
      },
      subscription_data: {
        metadata: {
          userId: userId,
          plan: plan
        }
      }
    })

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: session.url })
    }

  } catch (err) {
    console.error('Stripe checkout error:', err.message)
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    }
  }
}
