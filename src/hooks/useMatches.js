import { useState, useEffect, useRef } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { haversineDistance } from '../lib/matchUtils'

/**
 * Real-time hook for open matches.
 * - No court filter: fetch all open future matches, sort by distance, take closest 20.
 * - Court filter: fetch next 20 upcoming matches at that court.
 */
export function useMatches(location, courtFilter = null) {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const unsubRef = useRef(null)

  useEffect(() => {
    if (unsubRef.current) {
      unsubRef.current()
      unsubRef.current = null
    }

    setLoading(true)
    const now = Timestamp.now()
    const col = collection(db, 'Matches')

    let q
    if (courtFilter) {
      // Court selected: next 20 upcoming matches at that court
      q = query(
        col,
        where('status', '==', 'open'),
        where('court.name', '==', courtFilter),
        where('scheduledAt', '>', now),
        orderBy('scheduledAt', 'asc'),
        limit(20)
      )
    } else {
      // No court filter: next 20 upcoming matches, filter status client-side
      q = query(
        col,
        where('scheduledAt', '>', now),
        orderBy('scheduledAt', 'asc'),
        limit(20)
      )
    }

    const unsub = onSnapshot(
      q,
      snap => {
        let docs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(m => !m.status || m.status === 'open')

        if (!courtFilter && location) {
          // Filter out matches more than 100 miles away (requires lat/lon on the match)
          docs = docs.filter(m => {
            if (!m.lat || !m.lon) return true // keep if no coords
            return haversineDistance(location.lat, location.lon, m.lat, m.lon) <= 100
          })
          // Sort remaining by distance
          docs.sort((a, b) =>
            haversineDistance(location.lat, location.lon, a.lat, a.lon) -
            haversineDistance(location.lat, location.lon, b.lat, b.lon)
          )
        }

        setMatches(docs)
        setLoading(false)
      },
      err => {
        setError(err.message)
        setLoading(false)
      }
    )

    unsubRef.current = unsub
    return () => unsub()
  }, [location?.lat, location?.lon, courtFilter])

  return { matches, loading, error }
}

/**
 * My Matches: open matches where user is a participant.
 * Pass enabled=false to skip subscribing (e.g. when on a different tab).
 */
export function useMyMatches(uid, enabled = true) {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid || !enabled) { setLoading(false); return }
    setLoading(true)
    const now = Timestamp.now()
    const q = query(
      collection(db, 'Matches'),
      where('participantIDs', 'array-contains', uid),
      where('status', '==', 'open'),
      where('scheduledAt', '>', now),
      orderBy('scheduledAt', 'asc'),
      limit(20)
    )
    const unsub = onSnapshot(q, snap => {
      setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [uid, enabled])

  return { matches, loading }
}

/**
 * Recent matches: completed matches where user participated and hasn't confirmed result.
 * Pass enabled=false to skip subscribing (e.g. when on a different tab).
 */
export function useRecentMatches(uid, enabled = true) {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid || !enabled) { setLoading(false); return }
    setLoading(true)
    const q = query(
      collection(db, 'Matches'),
      where('participantIDs', 'array-contains', uid),
      where('status', '==', 'completed'),
      orderBy('scheduledAt', 'desc'),
      limit(20)
    )
    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const pending = docs.filter(m => !m.resultConfirmations?.[uid])
      setMatches(pending)
      setLoading(false)
    })
    return unsub
  }, [uid, enabled])

  return { matches, loading }
}
