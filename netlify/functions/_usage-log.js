// Shared helper for TASKS.md #13 — basic visibility into external API call
// volume (Google Places/Maps, Viator, Travelpayouts) since none of these
// have any monitoring today. Counters are per warm function instance only
// (serverless — they reset on cold start), so this isn't an exact running
// total. It's enough to spot an unexpected spike in Netlify's function logs
// without standing up a separate analytics service; use each provider's own
// dashboard for authoritative usage/billing numbers.

const counts = {};

function logApiCall(provider, detail) {
  counts[provider] = (counts[provider] || 0) + 1;
  console.log('[api-usage] ' + provider + ' call #' + counts[provider] + (detail ? ' (' + detail + ')' : '') + ' at ' + new Date().toISOString());
}

module.exports = { logApiCall };
