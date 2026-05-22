/**
 * Generate ghost/suggested match time slots for nearby courts.
 *
 * fullSchedule=true  → every hour 6am–10pm today + tomorrow (used for selected court view)
 * fullSchedule=false → fixed sparse slots, up to 2 per court, 6 total (used for "no matches" banner)
 */

const FIXED_HOURS = [8, 12, 14, 18, 20] // 8am, 12pm, 2pm, 6pm, 8pm
const ALL_HOURS = Array.from({ length: 17 }, (_, i) => i + 6) // 6am–10pm inclusive

export function generateSuggestedMatches(courts, location, fullSchedule = false) {
  const now = new Date()
  const hours = fullSchedule ? ALL_HOURS : FIXED_HOURS
  const targetCourts = fullSchedule ? courts.slice(0, 1) : courts.slice(0, 3)
  const results = []

  for (const court of targetCourts) {
    const slots = []
    const openHour = court.openHour ?? 6
    const closeHour = court.closeHour ?? 22

    for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
      for (const hour of hours) {
        // Skip if outside court hours
        if (hour < openHour || hour > closeHour) continue

        const slot = new Date(now)
        slot.setDate(slot.getDate() + dayOffset)
        slot.setHours(hour, 0, 0, 0)

        // Skip past slots (with 15 min buffer)
        if (slot.getTime() <= now.getTime() + 15 * 60 * 1000) continue

        // In sparse mode cap at 2 slots per court
        if (!fullSchedule && slots.length >= 2) break

        slots.push(slot)
      }
      if (!fullSchedule && slots.length >= 2) break
    }

    for (const slot of slots) {
      results.push({
        id: `ghost-${court.name}-${slot.getTime()}`,
        isGhost: true,
        ghostSlot: slot,
        court: {
          name: court.name,
          geoPoint: { latitude: court.lat, longitude: court.lng },
          address: court.name,
          totalCourts: court.totalCourts,
          openHour,
          closeHour,
          maxMatchDuration: court.maxMatchDuration,
        },
        scheduledAt: { toDate: () => slot },
        durationMinutes: 60,
        matchType: 'singles',
        maxPlayers: 2,
        participantIDs: [],
        lat: court.lat,
        lon: court.lng,
      })
    }
  }

  results.sort((a, b) => a.ghostSlot.getTime() - b.ghostSlot.getTime())

  return fullSchedule ? results : results.slice(0, 6)
}
