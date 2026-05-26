/**
 * Vercel serverless proxy for the Overpass API.
 * Accepts JSON { query: "..." } — avoids raw-body stream issues.
 */

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { query } = req.body || {}
  if (!query) {
    return res.status(400).json({ error: 'Missing query in request body' })
  }

  const errors = []

  for (const url of ENDPOINTS) {
    try {
      console.log(`[overpass proxy] Trying ${url}`)
      const response = await fetch(url, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        signal: AbortSignal.timeout(28000),
      })
      console.log(`[overpass proxy] ${url} → ${response.status}`)
      if (!response.ok) {
        errors.push(`${url}: HTTP ${response.status}`)
        continue
      }
      const data = await response.json()
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
      return res.status(200).json(data)
    } catch (err) {
      console.error(`[overpass proxy] ${url} failed:`, err.message)
      errors.push(`${url}: ${err.message}`)
    }
  }

  return res.status(502).json({ error: 'All Overpass endpoints failed', detail: errors })
}
