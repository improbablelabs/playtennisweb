export async function reverseGeocodeCity(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`,
      { headers: { 'Accept-Language': 'en' }, signal: AbortSignal.timeout(5000) }
    )
    const data = await res.json()
    return data.address?.city || data.address?.town || data.address?.village || null
  } catch {
    return null
  }
}
