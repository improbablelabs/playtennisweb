import { haversineDistance } from '../lib/matchUtils'

// Returns a static OSM tile image URL centered on lat/lon at a given zoom
function staticMapUrl(lat, lng, zoom = 15, width = 600, height = 300) {
  // Use the openstreetmap.org tile CDN — build a URL for the center tile
  // then use a proper static maps service
  const tileSize = 256
  const n = Math.pow(2, zoom)
  const xTile = Math.floor(((lng + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const yTile = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)

  // Use the free OSM static map tile approach — single tile as background
  // We'll use the geoapify static maps free tier (no key needed for basic use)
  // Fallback: just link to OSM
  return `https://tile.openstreetmap.org/${zoom}/${xTile}/${yTile}.png`
}

// Better: use a 3-tile wide image via a proper static map API
function osmStaticUrl(lat, lng, zoom = 15) {
  // Use staticmap.de which is free and gives a proper static map
  return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005},${lat - 0.003},${lng + 0.005},${lat + 0.003}&layer=mapnik&marker=${lat},${lng}`
}

export default function CourtInfoCard({ court, openMatches, location, onClose }) {
  const matchCount = openMatches.filter(
    m => m.locationKey === court.name || m.court?.name === court.name
  ).length

  const distMi = location
    ? haversineDistance(location.lat, location.lon, court.lat, court.lng).toFixed(1)
    : null

  const openTime = `${formatHour(court.openHour)} – ${formatHour(court.closeHour)}`
  const iframeUrl = osmStaticUrl(court.lat, court.lng)

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-3 overflow-hidden">
      {/* Mini map via iframe */}
      <div className="relative" style={{ height: 160 }}>
        <iframe
          title={court.name}
          src={iframeUrl}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          scrolling="no"
        />
        {/* Overlay to block iframe interaction / clicks */}
        <div className="absolute inset-0" style={{ pointerEvents: 'none' }} />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 bg-white rounded-full w-7 h-7 flex items-center justify-center shadow-md border border-gray-100"
          style={{ pointerEvents: 'auto' }}
        >
          <svg viewBox="0 0 20 20" className="w-4 h-4 text-gray-500" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Info row */}
      <div className="px-4 py-3 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-black text-sm truncate">{court.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{openTime}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {distMi && (
            <>
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold text-black">{distMi}</span>
                <span className="text-[10px] text-gray-400">mi away</span>
              </div>
              <div className="w-px h-6 bg-gray-100" />
            </>
          )}
          <div className="flex flex-col items-center">
            <span className="text-sm font-bold text-black">{court.totalCourts}</span>
            <span className="text-[10px] text-gray-400">{court.totalCourts === 1 ? 'court' : 'courts'}</span>
          </div>
          <div className="w-px h-6 bg-gray-100" />
          <div className="flex flex-col items-center">
            <span className="text-sm font-bold text-black">{matchCount}</span>
            <span className="text-[10px] text-gray-400">{matchCount === 1 ? 'match' : 'matches'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatHour(h) {
  if (h === 0) return '12am'
  if (h === 12) return '12pm'
  return h < 12 ? `${h}am` : `${h - 12}pm`
}
