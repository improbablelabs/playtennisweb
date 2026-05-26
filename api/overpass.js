/**
 * Vercel serverless proxy for the Overpass API.
 * Accepts JSON { query: "..." } from the browser.
 * Forwards to Overpass as form-encoded data= body (the correct format).
 */

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { query } = req.body || {}
  if (!query) {
    return res.status(400).json({ error: 'Missing query in request body' })
  }

  // Overpass expects application/x-www-form-urlencoded with data=<query>
  const formBody = 'data=' + encodeURIComponent(query)
  const errors = []

  for (const url of ENDPOINTS) {
    try {
      console.log(`[overpass proxy] Trying ${url}`)
      const response = await fetch(url, {
        method: 'POST',
        body: formBody,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(28000),
      })
      console.log(`[overpass proxy] ${url} → ${response.status}`)
      if (!response.ok) {
        const text = await response.text()
        console.error(`[overpass proxy] Error body: ${text.slice(0, 500)}`)
        errors.push(`${url}: HTTP ${response.status} — ${text.slice(0, 200)}`)
        continue
      }
      const data = await response.json()
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
      return res.status(200).json(data)
    } catch (err) {
      console.error(`[overpass proxy] ${url} failed: ${err.message}`)
      errors.push(`${url}: ${err.message}`)
    }
  }

  return res.status(502).json({ error: 'All Overpass endpoints failed', detail: errors })
}
