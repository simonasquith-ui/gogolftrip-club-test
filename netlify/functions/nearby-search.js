// netlify/functions/nearby-search.js
// Returns MULTIPLE results near a point, for the Explore tab's card grid +
// map. This is deliberately separate from geocode.js, which returns a
// single best match for a specific named place — different job, different
// shape of response, so existing callers of geocode.js are untouched.
//
// Client calls: POST { lat, lng, category, keyword? }
// category is one of: 'course' | 'hotel' | 'restaurant' | 'activity'
// and maps to a Google Places "type" under the hood.

const CATEGORY_TO_PLACES_TYPE = {
  course: 'golf_course',
  hotel: 'lodging',
  restaurant: 'restaurant',
  activity: 'tourist_attraction'
}

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

    const { lat, lng, category, keyword, radius } = JSON.parse(event.body || '{}')
    const placesType = CATEGORY_TO_PLACES_TYPE[category]
    if (!lat || !lng || !placesType) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing lat/lng, or category must be one of: course, hotel, restaurant, activity' })
      }
    }

    const url = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json' +
      '?location=' + encodeURIComponent(lat + ',' + lng) +
      '&radius=' + encodeURIComponent(radius || 15000) + // ~9 miles default — wide enough for "near this destination" without pulling in a whole country
      '&type=' + encodeURIComponent(placesType) +
      (keyword ? '&keyword=' + encodeURIComponent(keyword) : '') +
      '&key=' + apiKey

    const response = await fetch(url)
    const data = await response.json()

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: [], error: 'Places error: ' + data.status })
      }
    }

    const results = (data.results || []).slice(0, 20).map(function (p) {
      return {
        place_id: p.place_id,
        name: p.name,
        rating: p.rating || null,
        user_ratings_total: p.user_ratings_total || 0,
        price_level: typeof p.price_level === 'number' ? p.price_level : null, // 0-4, Google's own scale — not all place types return this
        vicinity: p.vicinity || '',
        lat: p.geometry && p.geometry.location ? p.geometry.location.lat : null,
        lng: p.geometry && p.geometry.location ? p.geometry.location.lng : null,
        photo_reference: (p.photos && p.photos[0] && p.photos[0].photo_reference) || null,
        open_now: p.opening_hours ? !!p.opening_hours.open_now : null
      }
    }).filter(function (r) { return r.lat && r.lng })

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800' // 30 min — these lists don't need to be second-fresh
      },
      body: JSON.stringify({ results: results, center: { lat: lat, lng: lng } })
    }

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    }
  }
}
