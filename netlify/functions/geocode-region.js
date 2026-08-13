// netlify/functions/geocode-region.js
const { logApiCall } = require('./_usage-log')
// Resolves a general destination/region name (e.g. "Algarve, Portugal") to
// its actual geographic centre, using Google's Geocoding API — NOT Places
// Text Search, which is what geocode.js uses for finding a SPECIFIC named
// venue (a course, a hotel). Those are different jobs: Text Search ranks
// businesses/POIs by relevance to a query and can land on an oddly-ranked
// specific place for a broad regional query; the Geocoding API is built
// specifically to resolve place names (regions, cities, addresses) to a
// real centroid. Using the wrong one here was the root cause of Stays and
// Restaurants searches (tight 8-15km radius) coming back nowhere near the
// intended destination, even though Courses (40km radius) mostly hid it.
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

    const { query } = JSON.parse(event.body || '{}')
    if (!query) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'No query provided' })
      }
    }

    const url = 'https://maps.googleapis.com/maps/api/geocode/json' +
      '?address=' + encodeURIComponent(query) +
      '&key=' + apiKey

    logApiCall('google-geocoding', query)
    const response = await fetch(url)
    const data = await response.json()

    if (data.status !== 'OK' || !data.results || !data.results.length) {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No results found', status: data.status })
      }
    }

    const result = data.results[0]
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400' // region centroids don't change — cache a full day
      },
      body: JSON.stringify({
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        formattedAddress: result.formatted_address,
        // The bounding box tells us roughly how "big" the resolved place is
        // (a whole country vs a single street) — useful later if we want to
        // scale the search radius to match, rather than a fixed guess.
        viewport: result.geometry.viewport || null
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
