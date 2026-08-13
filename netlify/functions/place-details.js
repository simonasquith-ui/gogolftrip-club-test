// netlify/functions/place-details.js
const { logApiCall } = require('./_usage-log')
// Looks up a single place's website (if it has one) and Google's own Maps
// page for it. Deliberately NOT called for every result in a search — that
// would be 20 extra Places API calls per search for links most people never
// click. Instead the Explore tab calls this once, lazily, the moment
// someone actually clicks "Visit" on a specific result.
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
    const apiKey = process.env.GOOGLE_PLACES_API_KEY
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not set' })
      }
    }

    const { place_id } = JSON.parse(event.body || '{}')
    if (!place_id) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing place_id' })
      }
    }

    const url = 'https://maps.googleapis.com/maps/api/place/details/json' +
      '?place_id=' + encodeURIComponent(place_id) +
      '&fields=website,url,photos' + // added photos — Search results sometimes come back with an empty photos array for a place that Details still has full photo coverage for (lodging listings in particular seem prone to this)
      '&key=' + apiKey

    logApiCall('google-places-details')
    const response = await fetch(url)
    const data = await response.json()

    if (data.status !== 'OK') {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        // Fail soft with a manually-built Maps link — always works even if
        // this lookup itself fails, so the button never dead-ends.
        body: JSON.stringify({ website: null, url: 'https://www.google.com/maps/place/?q=place_id:' + place_id, photos: [] })
      }
    }

    const photos = ((data.result && data.result.photos) || []).slice(0, 5).map(function (ph) { return ph.photo_reference })

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        website: (data.result && data.result.website) || null,
        url: (data.result && data.result.url) || ('https://www.google.com/maps/place/?q=place_id:' + place_id),
        photos: photos
      })
    }

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    }
  }
}
