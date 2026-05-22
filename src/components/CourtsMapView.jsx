import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'

const SEARCH_RADIUS_M = 10000

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

async function geocodeAddress(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
  const data = await res.json()
  if (!data.length) return null
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
}

export default function CourtsMapView({ courts, openMatches, location, selectedCourt, onSelectCourt, onSearchArea, visible }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const circleRef = useRef(null)
  const initialCenterRef = useRef(null)

  const [showSearchBtn, setShowSearchBtn] = useState(false)
  const [searching, setSearching] = useState(false)
  const [addressQuery, setAddressQuery] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeError, setGeocodeError] = useState(false)

  const center = location
    ? [location.lat, location.lon]
    : courts.length > 0
    ? [courts[0].lat, courts[0].lng]
    : [37, -122]

  const matchCountByCourt = {}
  for (const m of openMatches) {
    const key = m.locationKey || m.court?.name
    if (key) matchCountByCourt[key] = (matchCountByCourt[key] || 0) + 1
  }

  // Mount map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, { center, zoom: 13, zoomControl: false })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    initialCenterRef.current = map.getCenter()

    map.on('moveend', () => {
      const c = map.getCenter()
      const init = initialCenterRef.current
      if (!init) return
      const dist = haversineM(c.lat, c.lng, init.lat, init.lng)
      const moved = dist > 5000
      setShowSearchBtn(moved)

      if (moved) {
        circleRef.current?.remove()
        circleRef.current = L.circle([c.lat, c.lng], {
          radius: SEARCH_RADIUS_M,
          color: '#9aab00',
          fillColor: '#dae200',
          fillOpacity: 0.12,
          weight: 2.5,
          dashArray: '8 5',
        }).addTo(map)
      } else {
        circleRef.current?.remove()
        circleRef.current = null
      }
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Invalidate size when map becomes visible after being hidden
  useEffect(() => {
    if (visible && mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 50)
    }
  }, [visible])

  // Update markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    if (location) {
      const dot = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;background:#dae200;border:2.5px solid #000;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      })
      markersRef.current.push(L.marker([location.lat, location.lon], { icon: dot }).addTo(map))
    }

    courts.forEach(court => {
      const count = matchCountByCourt[court.name] || 0
      const isSelected = selectedCourt?.name === court.name
      const size = isSelected ? 42 : 34
      const bg = count > 0 ? '#000' : '#9ca3af'
      const border = isSelected ? '3px solid #dae200' : count > 0 ? '2.5px solid #dae200' : '2px solid #fff'

      const icon = L.divIcon({
        className: '',
        html: `<div style="width:${size}px;height:${size}px;background:${bg};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:${border}">${count}</div>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -(size / 2 + 4)],
      })

      const marker = L.marker([court.lat, court.lng], { icon })
        .addTo(map)
        .bindPopup(`<div style="min-width:130px;font-family:inherit"><p style="font-weight:700;font-size:13px;margin:0">${court.name}</p><p style="font-size:12px;color:#6b7280;margin:2px 0 0">${count > 0 ? `${count} open match${count !== 1 ? 'es' : ''}` : 'No matches yet'}</p></div>`, { closeButton: false })
        .on('click', () => onSelectCourt(selectedCourt?.name === court.name ? null : court))

      markersRef.current.push(marker)
    })
  }, [courts, openMatches, location, selectedCourt]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchArea = async () => {
    const map = mapRef.current
    if (!map || !onSearchArea) return
    const { lat, lng } = map.getCenter()
    setSearching(true)
    setShowSearchBtn(false)
    initialCenterRef.current = map.getCenter()
    try { await onSearchArea(lat, lng) } finally { setSearching(false) }
  }

  const handleGeocode = async (e) => {
    e.preventDefault()
    if (!addressQuery.trim() || geocoding) return
    setGeocodeError(false)
    setGeocoding(true)
    try {
      const result = await geocodeAddress(addressQuery)
      if (!result) { setGeocodeError(true); return }
      const map = mapRef.current
      if (!map) return
      map.setView([result.lat, result.lon], 13, { animate: true })
    } finally {
      setGeocoding(false)
    }
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Address search — top left */}
      <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 1000, display: 'flex', gap: 8, alignItems: 'center' }}>
        {/* Address search */}
        <form onSubmit={handleGeocode} style={{ display: 'flex', width: 200, gap: 0, background: '#fff', borderRadius: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.2)', overflow: 'hidden', border: geocodeError ? '1.5px solid #ef4444' : '1.5px solid transparent' }}>
          <input
            value={addressQuery}
            onChange={e => { setAddressQuery(e.target.value); setGeocodeError(false) }}
            placeholder="City, address, or zip…"
            style={{
              flex: 1, border: 'none', outline: 'none', padding: '8px 12px',
              fontSize: 13, fontFamily: 'inherit', background: 'transparent', minWidth: 0,
            }}
          />
          <button
            type="submit"
            disabled={geocoding}
            style={{
              background: 'none', border: 'none', padding: '0 12px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', color: geocodeError ? '#ef4444' : '#6b7280',
            }}
          >
            {geocoding
              ? <div style={{ width: 14, height: 14, border: '2px solid #9ca3af', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              : geocodeError
              ? <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
              : <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
            }
          </button>
        </form>

      </div>

      {/* Search this area button — centered at top */}
      {(showSearchBtn || searching) && (
        <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}>
          <button
            onClick={handleSearchArea}
            disabled={searching}
            style={{
              background: '#000', color: '#fff', border: 'none', borderRadius: 20,
              padding: '8px 16px', fontSize: 13, fontWeight: 700,
              cursor: searching ? 'default' : 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: searching ? 0.7 : 1, whiteSpace: 'nowrap',
            }}
          >
            {searching
              ? <><div style={{ width: 12, height: 12, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Searching…</>
              : 'Search Area'
            }
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
