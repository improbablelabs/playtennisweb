/**
 * Haversine distance between two lat/lng points in miles.
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8 // Earth radius in miles
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg) {
  return (deg * Math.PI) / 180
}

/**
 * Format a Firestore Timestamp or Date for display.
 */
export function formatMatchTime(ts) {
  const date = ts?.toDate ? ts.toDate() : new Date(ts)
  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const isToday = date.toDateString() === now.toDateString()
  const isTomorrow = date.toDateString() === tomorrow.toDateString()

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (isToday) return `Today ${timeStr}`
  if (isTomorrow) return `Tomorrow ${timeStr}`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + timeStr
}

/**
 * Format a Firestore Timestamp or Date as a short date.
 */
export function formatShortDate(ts) {
  const date = ts?.toDate ? ts.toDate() : new Date(ts)
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Skill level display string.
 */
export function skillLevelLabel(skillLevel) {
  if (!skillLevel) return 'Any'
  if (skillLevel.kind === 'rating') return `${skillLevel.value?.toFixed(1)} ELO`
  return skillLevel.kind.charAt(0).toUpperCase() + skillLevel.kind.slice(1)
}

/**
 * Get available time slots for a court given existing matches.
 */
export function getAvailableSlots(court, date, existingMatches, durationMinutes) {
  const slots = []
  const openH = court.openHour
  const closeH = court.closeHour

  for (let hour = openH; hour < closeH; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const slotStart = new Date(date)
      slotStart.setHours(hour, min, 0, 0)
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000)

      if (slotEnd.getHours() > closeH || (slotEnd.getHours() === closeH && slotEnd.getMinutes() > 0)) continue
      if (slotStart < new Date()) continue

      // Check court availability (simple: count overlapping matches)
      const overlapping = existingMatches.filter(m => {
        const mStart = m.scheduledAt?.toDate ? m.scheduledAt.toDate() : new Date(m.scheduledAt)
        const mEnd = m.endTime?.toDate ? m.endTime.toDate() : new Date(mEnd)
        return mStart < slotEnd && mEnd > slotStart
      })

      if (overlapping.length < court.totalCourts) {
        slots.push(slotStart)
      }
    }
  }
  return slots
}

export function getMaxPlayersForType(matchType) {
  if (matchType === 'singles') return 2
  if (matchType === 'doubles') return 4
  return 2 // hitting default
}

export const MILES_PER_DEGREE_LAT = 69
export const SEARCH_RADIUS_MILES = 10
