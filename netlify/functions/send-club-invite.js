// Club-branded invite email, separate from send-invite.js (which is for
// one golfer inviting another to a specific trip — different subject,
// different tone, different data). Called once per recipient from the
// Club Dashboard's bulk-invite tool, not in a single bulk request, so a
// slow or failed send for one person never blocks the rest.
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
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'RESEND_API_KEY not set' })
      }
    }

    const { toEmail, clubName, clubTagline, primaryColor, inviteUrl } = JSON.parse(event.body)

    if (!toEmail || !inviteUrl || !clubName) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing required fields' })
      }
    }

    const brandColor = primaryColor || '#1a3a2a'

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: 'GolfTrip <onboarding@resend.dev>',
        to: [toEmail],
        subject: `${clubName} members get free GolfTrip access — claim yours`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f7f4ee;padding:40px 20px">
            <div style="background:${brandColor};padding:24px;border-radius:12px;text-align:center;margin-bottom:24px">
              <h1 style="color:#c9a84c;font-family:Georgia,serif;margin:0;font-size:26px">${clubName}</h1>
              ${clubTagline ? `<p style="color:#e8d5b0;margin:8px 0 0;font-size:14px">${clubTagline}</p>` : ''}
            </div>
            <div style="background:#ffffff;padding:32px;border-radius:12px;border:1px solid #d4c9b0">
              <h2 style="color:#1a3a2a;font-family:Georgia,serif;margin-top:0">Your club has GolfTrip, on the house</h2>
              <p style="color:#6b7280;font-size:16px;line-height:1.6">
                ${clubName} covers the full cost of GolfTrip for every member — AI-powered trip planning for your next society outing or golf holiday, with real courses, hotels and flights, no agent markup.
              </p>
              <p style="color:#6b7280;font-size:16px;line-height:1.6">
                Nothing to pay, nothing to set up beyond signing in below.
              </p>
              <div style="text-align:center;margin:32px 0">
                <a href="${inviteUrl}" style="background:#c9a84c;color:#0f2318;padding:16px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block">
                  Claim Your Free Access ⛳
                </a>
              </div>
              <p style="color:#9ca3af;font-size:13px;text-align:center;margin-bottom:0">
                If you weren't expecting this, you can safely ignore this email.
              </p>
            </div>
            <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:20px">
              Sent via GolfTrip on behalf of ${clubName}
            </p>
          </div>
        `
      })
    })

    const data = await res.json()

    if (!res.ok) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Resend error: ' + JSON.stringify(data) })
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ success: true, id: data.id })
    }

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    }
  }
}
