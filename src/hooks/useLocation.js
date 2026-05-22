import { useState, useEffect } from 'react'

export function useLocation() {
  const [location, setLocation] = useState(null) // { lat, lon }
  const [locationError, setLocationError] = useState(null)
  const [locationLoading, setLocationLoading] = useState(false)

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.')
      return
    }
    setLocationLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude })
        setLocationLoading(false)
      },
      err => {
        setLocationError(err.message)
        setLocationLoading(false)
        setLocation(null)
      },
      { timeout: 10000 }
    )
  }

  return { location, locationError, locationLoading, requestLocation }
}
