/**
 * Vercel serverless proxy for the Overpass API.
 * Uses Node's built-in https module — works on Node 14/16/18.
 */
import https from 'https'
import http from 'http'

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

function postToUrl(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const lib = parsed.protocol === 'https:' ? https : http
    const bodyBuf = Buffer.from(body, 'utf8')

    const req = lib.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': bodyBuf.length,
        },
        timeout: 30000,
      },
      res => {
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode}`))
        }
        let raw = ''
        res.setEncoding('utf8')
        res.on('data', chunk => { raw += chunk })
        res.on('end', () => {
          try { resolve(JSON.parse(raw)) }
          catch (e) { reject(new Error('Invalid JSON from Overpass')) }
        })
      }
    )

    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    req.on('error', reject)
    req.write(bodyBuf)
    req.end()
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
      const data = await postToUrl(url, body)
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
      return res.status(200).json(data)
    } catch (err) {
      lastError = `${url}: ${err.message}`
      console.error('[Overpass proxy] Failed:', lastError)
    }
  }

  return res.status(502).json({ error: 'Overpass API unavailable', detail: lastError })
}
