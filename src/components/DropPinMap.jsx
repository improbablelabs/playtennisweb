import { useEffect, useRef, useState } from 'react'
import 'leaflet/dist/leaflet.css'

// Fix Leaflet's default marker icon paths broken by Vite
import L from 'leaflet'
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export default function DropPinMap({ initialLat, initialLon, onSelect, onClose }) {
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const [coords, setCoords] = useState({ lat: initialLat ?? 36.9741, lon: initialLon ?? -122.0308 })

  useEffect(() => {
    if (mapRef.current) return // already initialised

    const map = L.map('drop-pin-map', {
      center: [coords.lat, coords.lon],
      zoom: 15,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)

    const marker = L.marker([coords.lat, coords.lon], { draggable: true }).addTo(map)
    markerRef.current = marker

    marker.on('dragend', () => {
      const { lat, lng } = marker.getLatLng()
      setCoords({ lat, lon: lng })
    })

    map.on('click', (e) => {
      const { lat, lng } = e.latlng
      marker.setLatLng([lat, lng])
      setCoords({ lat, lon: lng })
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  const handleSelect = () => {
    onSelect({
      name: 'Custom Location',
      lat: coords.lat,
      lng: coords.lon,
      totalCourts: 2,
      openHour: 6,
      closeHour: 22,
      maxMatchDuration: 120,
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center justify-between shadow-sm shrink-0">
        <button onClick={onClose} className="text-sm font-medium text-gray-500">Cancel</button>
        <p className="text-sm font-bold text-black">Drop a Pin</p>
        <div className="w-12" />
      </div>

      <p className="bg-white text-center text-xs text-gray-400 pb-2">
        Tap or drag the pin to set your court location
      </p>

      {/* Map */}
      <div id="drop-pin-map" className="flex-1" />

      {/* Footer */}
      <div className="bg-white px-4 py-4 shadow-[0_-2px_8px_rgba(0,0,0,0.08)] shrink-0">
        <p className="text-xs text-center text-gray-400 mb-3">
          {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}
        </p>
        <button
          onClick={handleSelect}
          className="w-full bg-black text-white rounded-2xl py-3.5 font-bold"
        >
          Select This Location
        </button>
      </div>
    </div>
  )
}
