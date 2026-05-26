/**
 * Vercel serverless proxy for the Overpass API.
 * Avoids CORS issues when calling from the browser.
 * POST body: raw Overpass QL query string
 */

// Disable Vercel's body parser so we can read the raw text ourselves
export const config = {
  api: { bodyParser: false },
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk.toString() })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const body = await readRawBody(req)

  let lastError = null
  for (const url of ENDPOINTS) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        body,
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
