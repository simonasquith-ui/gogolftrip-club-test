// netlify/functions/drive-time.js
const { logApiCall } = require('./_usage-log')
// Real driving time/distance between two points, via Google's Distance
// Matrix API. Used to show "12 mins" between a course and where you're
// staying, etc. — one pair per call, kept simple since there are only ever
// a handful of committed itinerary items to chain together, not enough
// volume to justify a batched matrix call.
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

    const { origin, destination } = JSON.parse(event.body || '{}')
    if (!origin || !destination || !origin.lat || !destination.lat) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing origin/destination {lat, lng}' })
      }
    }

    const url = 'https://maps.googleapis.com/maps/api/distancematrix/json' +
      '?origins=' + encodeURIComponent(origin.lat + ',' + origin.lng) +
      '&destinations=' + encodeURIComponent(destination.lat + ',' + destination.lng) +
      '&mode=driving&units=imperial' +
      '&key=' + apiKey

    logApiCall('google-distance-matrix')
    const response = await fetch(url)
    const data = await response.json()

    const element = data.rows && data.rows[0] && data.rows[0].elements && data.rows[0].elements[0]
    if (!element || element.status !== 'OK') {
      return {
        statusCode: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No route found' })
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600' // drive times between two fixed points don't change hour to hour
      },
      body: JSON.stringify({
        durationText: element.duration.text,
        durationSeconds: element.duration.value,
        distanceText: element.distance.text
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
