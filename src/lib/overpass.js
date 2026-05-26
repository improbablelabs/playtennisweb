/**
 * Fetch nearby tennis courts from OpenStreetMap via the Overpass API.
 * Returns up to 30 courts sorted by distance from the user.
 *
 * Strategy: fetch tennis courts AND named parent areas (parks, sports centres)
 * in one query. Unnamed court clusters are then matched to the closest named
 * parent area within 300 m so we get a meaningful name.
 */
export async function fetchNearbyCourts(lat, lon, radiusMeters = 16000) {
  const query = `
    [out:json][timeout:25];
    (
      node["leisure"="tennis_court"](around:${radiusMeters},${lat},${lon});
      way["leisure"="tennis_court"](around:${radiusMeters},${lat},${lon});
      relation["leisure"="tennis_court"](around:${radiusMeters},${lat},${lon});
      node["sport"="tennis"](around:${radiusMeters},${lat},${lon});
      way["sport"="tennis"](around:${radiusMeters},${lat},${lon});
      relation["sport"="tennis"](around:${radiusMeters},${lat},${lon});
      way["leisure"~"park|sports_centre|recreation_ground|pitch"]["name"](around:${radiusMeters},${lat},${lon});
      relation["leisure"~"park|sports_centre|recreation_ground"]["name"](around:${radiusMeters},${lat},${lon});
    );
    out center tags;
  `

  // Use our serverless proxy in production to avoid CORS.
  // Falls back to direct endpoints in local dev (where /api/overpass isn't running).
  const directEndpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ]

  let res
  try {
    console.log('[Overpass] Trying proxy /api/overpass')
    const r = await fetch('/api/overpass', { method: 'POST', body: query, signal: AbortSignal.timeout(35000) })
    if (r.ok) res = r
  } catch (err) {
    console.warn('[Overpass] Proxy failed, trying direct:', err.message)
  }

  if (!res) {
    for (const url of directEndpoints) {
      try {
        console.log('[Overpass] Trying', url)
        res = await fetch(url, { method: 'POST', body: query, signal: AbortSignal.timeout(30000) })
        console.log('[Overpass] Response from', url, '— status:', res.status)
        if (res.ok) break
      } catch (err) {
        console.warn('[Overpass] Failed:', url, err.message)
      }
    }
  }

  if (!res?.ok) throw new Error('Overpass API error')
  const data = await res.json()
  console.log('[Overpass] Raw element count:', data.elements?.length)

  // Separate tennis courts from named parent areas
  const courtElements = []
  const namedAreas = []

  for (const el of data.elements) {
    const elLat = el.lat ?? el.center?.lat
    const elLon = el.lon ?? el.center?.lon
    if (!elLat || !elLon) continue

    const t = el.tags || {}
    const isCourt = t.leisure === 'tennis_court' || t.sport === 'tennis'
    const isNamedArea = !isCourt && t.name && (
      t.leisure === 'park' ||
      t.leisure === 'sports_centre' ||
      t.leisure === 'recreation_ground' ||
      t.leisure === 'pitch'
    )

    const name =
      t.name ||
      t['name:en'] ||
      t.designation ||
      t.operator ||
      t['addr:housename'] ||
      t.ref ||
      (t['addr:street'] ? `${t['addr:street']}${t['addr:housenumber'] ? ' ' + t['addr:housenumber'] : ''}` : null) ||
      null

    if (isCourt) {
      courtElements.push({ id: `${el.type}-${el.id}`, name, lat: elLat, lon: elLon })
    } else if (isNamedArea) {
      namedAreas.push({ name: t.name, lat: elLat, lon: elLon })
    }
  }

  console.log('[Overpass] Court elements:', courtElements.length, '| Named areas:', namedAreas.length)

  // Cluster court elements within 80 m of each other into one facility
  const clusters = []
  const used = new Set()

  for (let i = 0; i < courtElements.length; i++) {
    if (used.has(i)) continue
    const group = [courtElements[i]]
    used.add(i)
    for (let j = i + 1; j < courtElements.length; j++) {
      if (used.has(j)) continue
      if (haversineM(courtElements[i].lat, courtElements[i].lon, courtElements[j].lat, courtElements[j].lon) < 80) {
        group.push(courtElements[j])
        used.add(j)
      }
    }
    const named = group.find(e => e.name)
    const centerLat = group.reduce((s, e) => s + e.lat, 0) / group.length
    const centerLon = group.reduce((s, e) => s + e.lon, 0) / group.length
    clusters.push({
      name: named?.name ?? null,
      lat: centerLat,
      lon: centerLon,
      totalCourts: group.length,
    })
  }

  console.log('[Overpass] Clusters before naming:', clusters.length)

  // For unnamed clusters: 1) try closest named area, 2) fall back to Nominatim reverse geocode
  const unnamedClusters = clusters.filter(c => !c.name)

  // Step 1 — closest named area (up to 1 km)
  for (const cluster of unnamedClusters) {
    let best = null
    let bestDist = 1000
    for (const area of namedAreas) {
      const d = haversineM(cluster.lat, cluster.lon, area.lat, area.lon)
      if (d < bestDist) { bestDist = d; best = area }
    }
    if (best) {
      cluster.name = best.name
      console.log(`[Overpass] OSM area name: "${best.name}" (${bestDist.toFixed(0)}m)`)
    }
  }

  // Step 2 — Nominatim reverse geocode for anything still unnamed
  const stillUnnamed = clusters.filter(c => !c.name)
  console.log('[Overpass] Reverse geocoding', stillUnnamed.length, 'unnamed clusters')

  await Promise.all(stillUnnamed.map(async cluster => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${cluster.lat}&lon=${cluster.lon}&zoom=17&format=json&addressdetails=1`
      const r = await fetch(url, { headers: { 'Accept-Language': 'en' } })
      const data = await r.json()
      const addr = data.address || {}
      // Prefer a specific place name over a street
      const name =
        addr.leisure ||
        addr.amenity ||
        addr.park ||
        addr.recreation_ground ||
        (addr.road ? `${addr.road} Courts` : null) ||
        addr.suburb ||
        addr.neighbourhood ||
        null
      if (name) {
        cluster.name = name
        console.log(`[Overpass] Nominatim name: "${name}" for ${cluster.lat.toFixed(4)},${cluster.lon.toFixed(4)}`)
      } else {
        console.log(`[Overpass] No name found for ${cluster.lat.toFixed(4)},${cluster.lon.toFixed(4)}`, addr)
      }
    } catch (err) {
      console.warn('[Overpass] Nominatim failed:', err.message)
    }
  }))

  // Drop any cluster we still couldn't name
  const namedClusters = clusters.filter(c => c.name)

  // Deduplicate by name (keep the one closest to the user)
  const byName = new Map()
  for (const c of namedClusters) {
    const key = c.name.toLowerCase().trim()
    const dist = haversineM(lat, lon, c.lat, c.lon)
    if (!byName.has(key) || dist < byName.get(key).dist) {
      byName.set(key, { ...c, dist })
    }
  }

  const results = [...byName.values()]
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 30)
    .map(c => ({
      name: c.name,
      lat: c.lat,
      lng: c.lon,
      totalCourts: Math.max(1, c.totalCourts),
      openHour: 6,
      closeHour: 22,
      maxMatchDuration: 120,
    }))

  console.log('[Overpass] Final results:', results.map((c, i) => `${i + 1}. ${c.name} (${c.totalCourts} courts, ${haversineM(lat, lon, c.lat, c.lng).toFixed(0)}m away)`))

  return results
}

/**
 * Search for tennis courts by name globally via Overpass.
 * Used for the court search input.
 */
export async function searchCourtsByName(nameQuery) {
  if (!nameQuery.trim()) return []

  const escaped = nameQuery.replace(/['"\\]/g, ' ')
  const query = `
    [out:json][timeout:10];
    (
      node["sport"="tennis"]["name"~"${escaped}",i];
      way["sport"="tennis"]["name"~"${escaped}",i];
      node["leisure"="tennis_court"]["name"~"${escaped}",i];
      way["leisure"="tennis_court"]["name"~"${escaped}",i];
      node["leisure"="sports_centre"]["sport"="tennis"]["name"~"${escaped}",i];
      way["leisure"="sports_centre"]["sport"="tennis"]["name"~"${escaped}",i];
    );
    out center tags 20;
  `

  const directEndpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ]

  let res
  try {
    const r = await fetch('/api/overpass', { method: 'POST', body: query, signal: AbortSignal.timeout(15000) })
    if (r.ok) res = r
  } catch { /* fall through */ }

  if (!res) {
    for (const url of directEndpoints) {
      try {
        res = await fetch(url, { method: 'POST', body: query, signal: AbortSignal.timeout(10000) })
        if (res.ok) break
      } catch { /* try next */ }
    }
  }

  if (!res?.ok) return []
  const data = await res.json()

  return data.elements
    .map(el => {
      const lat = el.lat ?? el.center?.lat
      const lon = el.lon ?? el.center?.lon
      if (!lat || !lon || !el.tags?.name) return null
      return {
        name: el.tags.name,
        lat,
        lng: lon,
        totalCourts: 1,
        openHour: 6,
        closeHour: 22,
        maxMatchDuration: 120,
      }
    })
    .filter(Boolean)
    .filter(c => isTennisCourt(c.name))
    .slice(0, 15)
}

const TENNIS_TERMS = [
  'tennis', 'tenis', 'tênis', 'tenisi', 'tenisa',
  'теннис', 'тенис', 'теніс',
  'テニス', '테니스', '网球', '網球',
  'تنس', 'تنیس', 'טניס', 'टेनिस', 'টেনিস', 'เทนนิส',
]

function isTennisCourt(name) {
  const lower = name.toLowerCase()
  return TENNIS_TERMS.some(t => lower.includes(t.toLowerCase()))
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
