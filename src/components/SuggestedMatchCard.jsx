import { useState } from 'react'
import { addDoc, collection, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { haversineDistance, formatMatchTime } from '../lib/matchUtils'

export default function SuggestedMatchCard({ match, location, onCreated }) {
  const { firebaseUser, userProfile, requireLogin } = useAuth()
  const [loading, setLoading] = useState(false)

  const handleJoin = async () => {
    if (!firebaseUser) { requireLogin(); return }
    if (!userProfile) return

    setLoading(true)
    try {
      await addDoc(collection(db, 'Matches'), {
        hostID: firebaseUser.uid,
        createdAt: Timestamp.now(),
        scheduledAt: Timestamp.fromDate(match.ghostSlot),
        durationMinutes: 60,
        endTime: Timestamp.fromDate(new Date(match.ghostSlot.getTime() + 60 * 60000)),
        skillLevel: { kind: 'open' },
        hostSkillRating: userProfile.skillLevel ?? 0,
        matchType: 'singles',
        court: match.court,
        maxPlayers: 2,
        participantIDs: [firebaseUser.uid],
        status: 'open',
        completed: false,
        resultConfirmations: {},
        notes: '',
        locationKey: match.court.name,
        comments: [],
        lat: match.lat,
        lon: match.lon,
      })
      onCreated()
    } catch (err) {
      alert('Error creating match: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const distMi = location && match.lat && match.lon
    ? haversineDistance(location.lat, location.lon, match.lat, match.lon).toFixed(1)
    : null

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 relative">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-black text-sm">{formatMatchTime(match.scheduledAt)}</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
            Singles
          </span>
          <span className="text-xs text-gray-400">60m</span>
        </div>
      </div>

      {/* Slot */}
      <div className="my-3 flex items-center gap-4">
        {/* Empty question mark placeholder */}
        <div className="flex flex-col items-center gap-1">
          <div className="rounded-full bg-gray-100 flex items-center justify-center w-14 h-14">
            <span className="text-xl font-bold text-gray-400">?</span>
          </div>
          <span className="text-xs font-medium text-gray-400">Open</span>
          <span className="text-[10px] text-transparent select-none">_</span>
        </div>

        <div className="w-px h-12 bg-gray-200" />

        {/* Join slot */}
        <div className="flex flex-col items-center gap-1">
          {loading ? (
            <div className="w-14 h-14 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <button
              onClick={handleJoin}
              className="rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center w-14 h-14 hover:border-black transition-colors"
            >
              <span className="text-2xl font-bold text-brand leading-none">+</span>
            </button>
          )}
          <span className="text-xs font-medium text-gray-500">Join</span>
          <span className="text-[10px] text-transparent select-none">_</span>
        </div>
      </div>

      {/* Court + distance */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
        <div className="flex items-center gap-1.5 min-w-0">
          <svg viewBox="0 0 20 20" className="w-4 h-4 text-gray-400 shrink-0" fill="currentColor">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-semibold text-black truncate">{match.court?.name || 'Unknown Court'}</span>
          {distMi && (
            <span className="text-xs text-gray-400 shrink-0">· {distMi} mi</span>
          )}
        </div>
      </div>
    </div>
  )
}
