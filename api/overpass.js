/**
 * Vercel serverless proxy for the Overpass API.
 * Avoids CORS issues when calling from the browser.
 * POST body: raw Overpass QL query string
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ]

  let lastError = null
  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: req.body,
        headers: { 'Content-Type': 'text/plain' },
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) {
        lastError = `HTTP ${response.status} from ${url}`
        continue
      }
      const data = await response.json()
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
      return res.status(200).json(data)
    } catch (err) {
      lastError = err.message
    }
  }

  return res.status(502).json({ error: 'Overpass API unavailable', detail: lastError })
}
