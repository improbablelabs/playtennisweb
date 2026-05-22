import { useState } from 'react'
import {
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { formatMatchTime, haversineDistance } from '../lib/matchUtils'
import MatchCommentsView from './MatchCommentsView'

function Avatar({ profile, size = 56 }) {
  if (profile?.profilePic) {
    return (
      <img
        src={profile.profilePic}
        alt={profile.username}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="rounded-full bg-gray-200 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <span className="font-bold text-gray-600" style={{ fontSize: size * 0.35 }}>
        {profile?.username?.[0]?.toUpperCase() || '?'}
      </span>
    </div>
  )
}

function EmptySlot({ onClick }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={onClick}
        className="rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center w-14 h-14 hover:border-black transition-colors"
      >
        <span className="text-2xl font-bold text-brand leading-none">+</span>
      </button>
      <span className="text-xs font-medium text-gray-500">Join</span>
      <span className="text-[10px] text-transparent select-none">_</span>
    </div>
  )
}

function ParticipantSlot({ profile, isHost }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <Avatar profile={profile} size={56} />
        {isHost && (
          <div className="absolute -top-1 -right-1 bg-black rounded-full w-4 h-4 flex items-center justify-center">
            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="#dae200">
              <path d="M6 1L7.5 4.5L11 5L8.5 7.5L9 11L6 9.5L3 11L3.5 7.5L1 5L4.5 4.5Z" />
            </svg>
          </div>
        )}
      </div>
      <span className="text-xs font-medium text-gray-700 max-w-[60px] truncate">
        {profile?.username || '…'}
      </span>
      <span className="text-[10px] text-gray-400">{profile?.rating ?? 1000}</span>
    </div>
  )
}

export default function MatchCard({ match, participantProfiles, myMatches, location }) {
  const { userProfile, firebaseUser, requireLogin } = useAuth()
  const [loading, setLoading] = useState(false)

  const isHost = firebaseUser?.uid === match.hostID
  const isParticipant = match.participantIDs?.includes(firebaseUser?.uid)
  const isFull = (match.participantIDs?.length || 0) >= (match.maxPlayers || 2)
  const slotsTotal = match.maxPlayers || 2
  const participants = match.participantIDs || []

  const hostSkill = match.hostSkillRating ?? 0
  const userSkill = userProfile?.skillLevel ?? null
  const skillRangeLower = Math.max(1.0, hostSkill - 0.5)
  const skillRangeUpper = Math.min(7.0, hostSkill + 0.5)
  const inSkillRange = userSkill !== null && Math.abs(userSkill - hostSkill) <= 1.5

  const handleJoin = async () => {
    if (!firebaseUser) { requireLogin(); return }
    if (!userProfile) return // still loading, wait
    if (isParticipant) return
    if (isFull) { alert('This match is full.'); return }
    if (myMatches >= 3) { alert('You can only be in up to 3 open matches at a time.'); return }
    setLoading(true)
    try {
      await updateDoc(doc(db, 'Matches', match.id), {
        participantIDs: arrayUnion(firebaseUser.uid),
      })
    } catch (err) {
      alert('Error joining match: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLeave = async () => {
    if (!firebaseUser) return
    if (isHost) { alert('Hosts cannot leave their own match. Delete it instead.'); return }
    if (!confirm('Leave this match?')) return
    setLoading(true)
    try {
      await updateDoc(doc(db, 'Matches', match.id), {
        participantIDs: arrayRemove(firebaseUser.uid),
      })
    } catch (err) {
      alert('Error leaving match: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this match? This cannot be undone.')) return
    setLoading(true)
    try {
      await deleteDoc(doc(db, 'Matches', match.id))
    } catch (err) {
      alert('Error deleting match: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const openMaps = () => {
    const { lat, lon } = match
    if (lat && lon) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`, '_blank')
    } else if (match.court?.name) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(match.court.name + ' tennis')}`, '_blank')
    }
  }

  const matchTypeLabel = match.matchType
    ? match.matchType.charAt(0).toUpperCase() + match.matchType.slice(1)
    : 'Match'

  const matchTypeColor = {
    singles: 'bg-blue-50 text-blue-600 border-blue-100',
    doubles: 'bg-violet-50 text-violet-600 border-violet-100',
    hitting: 'bg-amber-50 text-amber-600 border-amber-100',
  }[match.matchType] || 'bg-gray-100 text-gray-700 border-gray-200'

  const renderSlots = () => {
    const slots = []
    for (let i = 0; i < slotsTotal; i++) {
      const uid = participants[i]
      const profile = uid ? participantProfiles?.[uid] : null
      const isHostSlot = uid === match.hostID

      if (uid) {
        slots.push(<ParticipantSlot key={i} profile={profile} isHost={isHostSlot} />)
      } else {
        slots.push(<EmptySlot key={i} onClick={!isParticipant ? handleJoin : undefined} />)
      }
    }

    if (slotsTotal === 4) {
      return (
        <div className="flex items-center justify-start gap-2">
          <div className="flex gap-2">{slots[0]}{slots[1]}</div>
          <div className="w-px h-12 bg-gray-200 mx-1" />
          <div className="flex gap-2">{slots[2]}{slots[3]}</div>
        </div>
      )
    }
    return (
      <div className="flex items-center justify-start gap-4">
        {slots[0]}
        <div className="w-px h-12 bg-gray-200" />
        {slots[1]}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-black text-sm">{formatMatchTime(match.scheduledAt)}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${matchTypeColor}`}>
            {matchTypeLabel}
          </span>
          <span className="text-xs text-gray-400">{match.durationMinutes}m</span>
        </div>
        {hostSkill >= 1 && hostSkill <= 7 && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-md border shrink-0 ${
            inSkillRange
              ? 'border-green-500 text-green-600'
              : 'border-gray-300 text-gray-500'
          }`}>
            {skillRangeLower.toFixed(1)}–{skillRangeUpper.toFixed(1)}
          </span>
        )}
      </div>

      {/* Player Slots */}
      <div className="my-3">{renderSlots()}</div>

      {/* Notes */}
      {match.notes && (
        <p className="text-xs text-gray-500 mt-2 mb-1 italic">"{match.notes}"</p>
      )}

      {/* Court */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50">
        <div className="flex items-center gap-1.5 min-w-0">
          <svg viewBox="0 0 20 20" className="w-4 h-4 text-gray-400 shrink-0" fill="currentColor">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-semibold text-black truncate">{match.court?.name || 'Unknown Court'}</span>
          {location && match.lat && match.lon && (
            <span className="text-xs text-gray-400 shrink-0">
              · {(haversineDistance(location.lat, location.lon, match.lat, match.lon) * 0.000621371).toFixed(1)} mi
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openMaps} className="text-xs text-blue-600 underline">Map</button>
          {isParticipant && !isHost && (
            <button
              onClick={handleLeave}
              disabled={loading}
              className="text-xs text-red-500 font-medium disabled:opacity-40"
            >
              Leave
            </button>
          )}
          {isHost && (
            <button
              onClick={handleDelete}
              disabled={loading}
              className="text-xs text-red-500 font-medium disabled:opacity-40"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Comments */}
      <MatchCommentsView match={match} />
    </div>
  )
}
