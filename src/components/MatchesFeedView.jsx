import { useState, useEffect, useRef } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { useLocation } from '../hooks/useLocation'
import { useMatches, useMyMatches, useRecentMatches } from '../hooks/useMatches'
import { computeRatingUpdates } from '../lib/eloUtils'
import { doc, updateDoc } from 'firebase/firestore'
import { fetchNearbyCourts } from '../lib/overpass'
import { generateSuggestedMatches } from '../lib/suggestedMatches'
import SuggestedMatchCard from './SuggestedMatchCard'
import MatchCard from './MatchCard'
import CreateMatchView from './CreateMatchView'
import MatchFilterSheet from './MatchFilterSheet'
import AppDownloadPrompt, { shouldShowAppPrompt } from './AppDownloadPrompt'
import { formatShortDate, formatMatchTime, haversineDistance } from '../lib/matchUtils'
import CourtsMapView from './CourtsMapView'
import CourtInfoCard from './CourtInfoCard'

const TABS = ['Open', 'My Matches', 'Recent']

export default function MatchesFeedView() {
  const { firebaseUser, userProfile, requireLogin } = useAuth()
  const [activeTab, setActiveTab] = useState('Open')
  const [showCreate, setShowCreate] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [filters, setFilters] = useState({})
  const [participantProfiles, setParticipantProfiles] = useState({})
  const [showAppPrompt, setShowAppPrompt] = useState(false)

  // Courts
  const [nearbyCourts, setNearbyCourts] = useState([])
  const [courtsLoading, setCourtsLoading] = useState(false)
  const [selectedCourt, setSelectedCourt] = useState(null) // null = All

  // Suggestions for the selected court (or all courts)
  const [suggestedMatches, setSuggestedMatches] = useState([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)

  // Map vs list toggle
  const [viewMode, setViewMode] = useState('list') // 'list' | 'map'

  const { location, locationError, locationLoading, requestLocation } = useLocation()
  const mapSearchedRef = useRef(false) // true once user has done a manual map area search

  useEffect(() => {
    if (!location) requestLocation()
  }, [])

  // Fetch nearby courts only when location has changed >500 m from last fetch.
  // Skip if the user has manually searched an area on the map.
  // Cache courts + fetch location in localStorage so refreshes don't re-fetch.
  useEffect(() => {
    if (!location) return
    if (mapSearchedRef.current) return // map search takes priority

    const CACHE_KEY = 'playtennnis_courts_cache'
    const MAX_AGE_MS = 60 * 60 * 1000 // 1 hour

    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
      if (cached) {
        const age = Date.now() - cached.timestamp
        const R = 6371000
        const dLat = ((location.lat - cached.lat) * Math.PI) / 180
        const dLon = ((location.lon - cached.lon) * Math.PI) / 180
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((cached.lat * Math.PI) / 180) *
          Math.cos((location.lat * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

        if (dist < 500 && age < MAX_AGE_MS) {
          console.log('[Courts] Using cached courts (moved', dist.toFixed(0), 'm,', Math.round(age / 60000), 'min old)')
          setNearbyCourts(cached.courts)
          return
        }
      }
    } catch { /* corrupt cache — fall through to fetch */ }

    console.log('[Courts] Fetching courts from Overpass')
    setCourtsLoading(true)
    fetchNearbyCourts(location.lat, location.lon)
      .then(courts => {
        setNearbyCourts(courts)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            lat: location.lat,
            lon: location.lon,
            courts,
            timestamp: Date.now(),
          }))
        } catch { /* storage full — ignore */ }
      })
      .catch(() => setNearbyCourts([]))
      .finally(() => setCourtsLoading(false))
  }, [location?.lat, location?.lon]) // eslint-disable-line react-hooks/exhaustive-deps

  const courtFilter = filters.court || null
  const { matches: openMatches, loading: openLoading } = useMatches(location, courtFilter)
  const { matches: myMatches, loading: myLoading } = useMyMatches(firebaseUser?.uid, activeTab === 'My Matches')
  const { matches: recentMatches, loading: recentLoading } = useRecentMatches(firebaseUser?.uid, activeTab === 'Recent')

  // Filter open matches by selected court pill
  const courtOpenMatches = selectedCourt
    ? openMatches.filter(m => m.court?.name === selectedCourt.name || m.locationKey === selectedCourt.name)
    : openMatches

  // Determine which matches to display in the list
  const displayMatches = activeTab === 'Open'
    ? courtOpenMatches
    : activeTab === 'My Matches'
    ? myMatches
    : recentMatches

  // Apply client-side filters for skill/type/elo
  const filteredMatches = displayMatches.filter(m => {
    if (filters.skillLevel && filters.skillLevel !== 'Any') {
      if (m.skillLevel?.kind !== filters.skillLevel) return false
    }
    if (filters.matchType && filters.matchType !== 'Any') {
      if (m.matchType !== filters.matchType) return false
    }
    if (filters.eloMin !== undefined && m.hostSkillRating < filters.eloMin) return false
    if (filters.eloMax !== undefined && m.hostSkillRating > filters.eloMax) return false

    // Hide full matches that are more than 50 miles away
    const isFull = (m.participantIDs?.length || 0) >= (m.maxPlayers || 2)
    if (isFull && location && m.lat && m.lon) {
      const distMi = haversineDistance(location.lat, location.lon, m.lat, m.lon)
      if (distMi > 50) return false
    }

    return true
  })

  // Stable key of all participant UIDs across visible matches
  const participantKey = filteredMatches
    .flatMap(m => m.participantIDs || [])
    .sort()
    .join(',')

  // Prefetch participant profiles
  useEffect(() => {
    if (!participantKey) return
    const allUIDs = participantKey.split(',').filter(Boolean)
    const missing = allUIDs.filter(uid => !participantProfiles[uid])
    if (missing.length === 0) return

    const fetchProfiles = async () => {
      const chunks = []
      for (let i = 0; i < missing.length; i += 10) chunks.push(missing.slice(i, i + 10))
      const results = {}
      for (const chunk of chunks) {
        const q = query(collection(db, 'Users'), where('userID', 'in', chunk))
        const snap = await getDocs(q)
        snap.docs.forEach(d => { results[d.id] = { userID: d.id, ...d.data() } })
      }
      setParticipantProfiles(prev => ({ ...prev, ...results }))
    }
    fetchProfiles()
  }, [participantKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Whether the current view has an open slot
  const hasAvailableSlot = courtOpenMatches.some(m => (m.participantIDs?.length || 0) < (m.maxPlayers || 2))

  // Generate suggestions:
  // - Court selected: always show full day schedule for that court
  // - No court selected: show suggestions only when no available slots
  useEffect(() => {
    if (openLoading || activeTab !== 'Open' || !nearbyCourts.length) return
    if (selectedCourt) {
      setSuggestedMatches(generateSuggestedMatches([selectedCourt], location, true))
    } else if (!hasAvailableSlot) {
      setSuggestedMatches(generateSuggestedMatches(nearbyCourts, location))
    } else {
      setSuggestedMatches([])
    }
  }, [hasAvailableSlot, openLoading, activeTab, selectedCourt?.name, nearbyCourts.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ghost slots filtered to not overlap with real matches (within 30 min)
  const courtGhosts = selectedCourt
    ? suggestedMatches.filter(ghost =>
        !filteredMatches.some(real => {
          const realTime = real.scheduledAt?.toDate?.()?.getTime?.() || 0
          return Math.abs(realTime - ghost.ghostSlot.getTime()) < 30 * 60 * 1000
        })
      )
    : suggestedMatches

  // Merged + sorted list for selected court view
  const mergedCourtItems = selectedCourt
    ? [
        ...filteredMatches.map(m => ({ type: 'match', item: m, time: m.scheduledAt?.toDate?.()?.getTime?.() || 0 })),
        ...courtGhosts.map(g => ({ type: 'ghost', item: g, time: g.ghostSlot.getTime() })),
      ].sort((a, b) => a.time - b.time)
    : []

  const handleConfirmResult = async (match, result) => {
    if (!firebaseUser) return
    try {
      const allUIDs = match.participantIDs || []
      const profileMap = {}
      allUIDs.forEach(uid => { if (participantProfiles[uid]) profileMap[uid] = participantProfiles[uid] })

      const updates = computeRatingUpdates(match, firebaseUser.uid, result, profileMap)

      await updateDoc(doc(db, 'Matches', match.id), {
        [`resultConfirmations.${firebaseUser.uid}`]: result,
        status: 'completed',
      })

      for (const { uid, newRating } of updates) {
        const isWin = uid === firebaseUser.uid ? result === 'win' : result === 'loss'
        await updateDoc(doc(db, 'Users', uid), {
          rating: newRating,
          ...(isWin ? { matchesWon: (profileMap[uid]?.matchesWon ?? 0) + 1 }
                    : { matchesLost: (profileMap[uid]?.matchesLost ?? 0) + 1 }),
        })
      }
    } catch (err) {
      alert('Error confirming result: ' + err.message)
    }
  }

  const loading = activeTab === 'Open' ? openLoading : activeTab === 'My Matches' ? myLoading : recentLoading

  const hasActiveFilters = filters.court || (filters.skillLevel && filters.skillLevel !== 'Any') ||
    (filters.matchType && filters.matchType !== 'Any') ||
    (filters.eloMin && filters.eloMin > 0) || (filters.eloMax && filters.eloMax < 14000)

  return (
    <div className="flex flex-col h-full bg-brand">
      {/* Header */}
      <div className="px-4 pt-12 pb-3 bg-brand">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" className="h-8 object-contain" />
            <h1 className="text-2xl font-black text-black">Play Tennis</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFilter(true)}
              className={`relative p-2 rounded-full ${hasActiveFilters ? 'bg-black' : 'bg-black/10'}`}
            >
              <svg viewBox="0 0 20 20" className={`w-5 h-5 ${hasActiveFilters ? 'text-brand' : 'text-black'}`} fill="currentColor">
                <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L13 10.414V17a1 1 0 01-.553.894l-4-2A1 1 0 018 15v-4.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
              </svg>
              {hasActiveFilters && (
                <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-brand rounded-full border border-black" />
              )}
            </button>
            <button
              onClick={() => firebaseUser ? setShowCreate(true) : requireLogin()}
              className="bg-black text-white rounded-full w-9 h-9 flex items-center justify-center font-bold text-xl"
            >
              +
            </button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex bg-black/10 rounded-xl p-1 gap-1">
          {TABS.map(tab => {
            const isMyMatches = tab === 'My Matches'
            const nextMatch = isMyMatches && myMatches.length > 0 ? myMatches[0] : null
            return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-lg text-sm font-semibold transition-all flex flex-col items-center justify-center ${
                isMyMatches && nextMatch ? 'py-1' : 'py-1.5'
              } ${
                activeTab === tab
                  ? 'bg-black text-white shadow-sm'
                  : 'text-black/70'
              }`}
            >
              <div className="flex items-center gap-1">
                <span>{tab}</span>
                {isMyMatches && myMatches.length > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                    activeTab === tab ? 'bg-white/20 text-white' : 'bg-black/10 text-black/60'
                  }`}>
                    {myMatches.length}
                  </span>
                )}
              </div>
              {isMyMatches && nextMatch && (
                <span className={`text-[10px] leading-none mt-0.5 ${
                  activeTab === tab ? 'text-white/70' : 'text-black/40'
                }`}>
                  {formatMatchTime(nextMatch.scheduledAt)}
                </span>
              )}
            </button>
            )
          })}
        </div>

        {/* Map/List toggle + court picker — Open tab only */}
        {activeTab === 'Open' && (nearbyCourts.length > 0 || courtsLoading) && (
          <>
            {/* Toggle */}
            <div className="flex items-center gap-2 mt-3">
              <div className="flex bg-black/10 rounded-lg p-0.5 gap-0.5">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    viewMode === 'list' ? 'bg-black text-white' : 'text-black/60'
                  }`}
                >
                  List
                </button>
                <button
                  onClick={() => setViewMode('map')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    viewMode === 'map' ? 'bg-black text-white' : 'text-black/60'
                  }`}
                >
                  Map
                </button>
              </div>
            </div>

            {/* Court pills */}
            <div className="flex gap-2 mt-2 overflow-x-auto pb-0.5 scrollbar-hide -mx-4 px-4">
              <button
                onClick={() => setSelectedCourt(null)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  selectedCourt === null ? 'bg-black text-white' : 'bg-black/10 text-black/70'
                }`}
              >
                <span>All</span>
                <span className={`text-[10px] font-bold px-1 py-0.5 rounded-full ${
                  selectedCourt === null ? 'bg-white/20 text-white' : 'bg-black/10 text-black/50'
                }`}>
                  {openMatches.filter(m => (m.participantIDs?.length || 0) < (m.maxPlayers || 2)).length}
                </span>
              </button>
              {nearbyCourts.map(court => {
                const count = openMatches.filter(m =>
                  (m.locationKey === court.name || m.court?.name === court.name) &&
                  (m.participantIDs?.length || 0) < (m.maxPlayers || 2)
                ).length
                const isSelected = selectedCourt?.name === court.name
                const hasMatches = count > 0
                return (
                  <button
                    key={court.name}
                    onClick={() => setSelectedCourt(isSelected ? null : court)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-black text-white'
                        : hasMatches
                        ? 'bg-white text-black'
                        : 'bg-black/10 text-black/70'
                    }`}
                  >
                    <span className="max-w-[120px] truncate">{court.name}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : hasMatches
                        ? 'bg-brand text-black'
                        : 'bg-black/10 text-black/50'
                    }`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* Full-screen map — always mounted so pan position is preserved on toggle */}
      {activeTab === 'Open' && nearbyCourts.length > 0 && (
        <div className="flex-1 overflow-hidden" style={{ display: viewMode === 'map' ? 'flex' : 'none' }}>
          <CourtsMapView
            courts={nearbyCourts}
            openMatches={openMatches}
            location={location}
            selectedCourt={selectedCourt}
            onSelectCourt={court => { setSelectedCourt(court); if (court) setViewMode('list') }}
            visible={viewMode === 'map'}
            onSearchArea={async (lat, lon) => {
              mapSearchedRef.current = true
              const courts = await fetchNearbyCourts(lat, lon)
              setNearbyCourts(courts)
            }}
          />
        </div>
      )}

      {/* Content */}
      <div className={`flex-1 overflow-y-auto px-4 pb-24 ${activeTab === 'Open' && viewMode === 'map' ? 'hidden' : ''}`}>
        {locationLoading && activeTab === 'Open' && (
          <div className="bg-white/60 rounded-2xl p-3 my-3 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin shrink-0" />
            <p className="text-xs text-black/60">Getting your location to sort by distance…</p>
          </div>
        )}

        {/* Court info card — shown in list mode when a court is selected */}
        {activeTab === 'Open' && viewMode === 'list' && selectedCourt && (
          <div className="mt-3">
            <CourtInfoCard
              court={selectedCourt}
              openMatches={openMatches}
              location={location}
              onClose={() => setSelectedCourt(null)}
            />
          </div>
        )}

        {/* Selected court: merged real matches + ghost slots sorted by time */}
        {activeTab === 'Open' && viewMode === 'list' && selectedCourt && !loading && (
          <>
            {/* Create your own match card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 mt-3 flex items-center justify-between">
              <div>
                <p className="font-bold text-black text-sm">Create Your Own Match</p>
                <p className="text-xs text-gray-400 mt-0.5">Pick any time, court, and format</p>
              </div>
              <button
                onClick={() => firebaseUser ? setShowCreate(true) : requireLogin()}
                className="bg-black text-white rounded-xl px-4 py-2 text-sm font-bold shrink-0"
              >
                Create
              </button>
            </div>

            <p className="text-xs font-semibold text-black/50 uppercase tracking-wide mb-3">
              Schedule · {selectedCourt.name}
            </p>

            {mergedCourtItems.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-2">
                <p className="text-black/50 text-sm">No upcoming slots</p>
              </div>
            ) : (
              mergedCourtItems.map(({ type, item }) =>
                type === 'match' ? (
                  <MatchCard
                    key={item.id}
                    match={item}
                    participantProfiles={participantProfiles}
                    myMatches={myMatches.length}
                    location={location}
                  />
                ) : (
                  <SuggestedMatchCard
                    key={item.id}
                    match={item}
                    location={location}
                    onCreated={() => setSuggestedMatches([])}
                  />
                )
              )
            )}
          </>
        )}

        {loading && viewMode === 'list' && (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && !hasAvailableSlot && !selectedCourt && activeTab === 'Open' && viewMode === 'list' && (
          <>
            {suggestionsLoading && (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!suggestionsLoading && suggestedMatches.length > 0 && (
              <>
                {/* Create your own match card */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-black text-sm">Create Your Own Match</p>
                    <p className="text-xs text-gray-400 mt-0.5">Pick any time, court, and format</p>
                  </div>
                  <button
                    onClick={() => firebaseUser ? setShowCreate(true) : requireLogin()}
                    className="bg-black text-white rounded-xl px-4 py-2 text-sm font-bold shrink-0"
                  >
                    Create
                  </button>
                </div>

                <p className="text-xs font-semibold text-black/50 uppercase tracking-wide mb-3 mt-2">
                  {selectedCourt ? `Suggested Times · ${selectedCourt.name}` : 'Suggested Times Nearby'}
                </p>
                {suggestedMatches.map(m => (
                  <SuggestedMatchCard
                    key={m.id}
                    match={m}
                    location={location}
                    onCreated={() => setSuggestedMatches([])}
                  />
                ))}
              </>
            )}
            {!suggestionsLoading && suggestedMatches.length === 0 && (location || activeTab !== 'Open') && (
              <div className="flex flex-col items-center py-12 gap-3">
                <div className="w-16 h-16 rounded-full bg-black/10 flex items-center justify-center">
                  <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none">
                    <circle cx="24" cy="24" r="20" stroke="black" strokeWidth="2.5" />
                    <path d="M24 4 C24 4 17 10 17 24 C17 38 24 44 24 44" stroke="black" strokeWidth="2.5" />
                    <path d="M24 4 C24 4 31 10 31 24 C31 38 24 44 24 44" stroke="black" strokeWidth="2.5" />
                    <line x1="4" y1="24" x2="44" y2="24" stroke="black" strokeWidth="2.5" />
                  </svg>
                </div>
                <p className="text-black font-semibold">No matches nearby</p>
                <p className="text-black/60 text-sm text-center">Be the first to create one!</p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="mt-2 bg-black text-white px-5 py-2.5 rounded-xl font-semibold text-sm"
                >
                  Create Match
                </button>
              </div>
            )}
          </>
        )}

        {!loading && filteredMatches.length === 0 && activeTab === 'My Matches' && (
          <div className="flex flex-col items-center py-12 gap-3">
            <div className="w-16 h-16 rounded-full bg-black/10 flex items-center justify-center">
              <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none">
                <circle cx="24" cy="24" r="20" stroke="black" strokeWidth="2.5" />
                <path d="M24 4 C24 4 17 10 17 24 C17 38 24 44 24 44" stroke="black" strokeWidth="2.5" />
                <path d="M24 4 C24 4 31 10 31 24 C31 38 24 44 24 44" stroke="black" strokeWidth="2.5" />
                <line x1="4" y1="24" x2="44" y2="24" stroke="black" strokeWidth="2.5" />
              </svg>
            </div>
            <p className="text-black font-semibold">You haven&#39;t joined any matches</p>
            <p className="text-black/60 text-sm text-center">Join a match from the Open tab.</p>
          </div>
        )}

        {!loading && filteredMatches.length === 0 && activeTab === 'Recent' && (
          <div className="flex flex-col items-center py-12 gap-3">
            <div className="w-16 h-16 rounded-full bg-black/10 flex items-center justify-center">
              <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none">
                <circle cx="24" cy="24" r="20" stroke="black" strokeWidth="2.5" />
                <path d="M24 4 C24 4 17 10 17 24 C17 38 24 44 24 44" stroke="black" strokeWidth="2.5" />
                <path d="M24 4 C24 4 31 10 31 24 C31 38 24 44 24 44" stroke="black" strokeWidth="2.5" />
                <line x1="4" y1="24" x2="44" y2="24" stroke="black" strokeWidth="2.5" />
              </svg>
            </div>
            <p className="text-black font-semibold">No results to confirm</p>
            <p className="text-black/60 text-sm text-center">Completed matches will appear here.</p>
          </div>
        )}

        {/* Recent tab cards */}
        {activeTab === 'Recent' && !loading && filteredMatches.map(match => (
          <div key={match.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-3">
            <div className="mb-2">
              <p className="font-bold text-black text-sm">{match.court?.name}</p>
              <p className="text-xs text-gray-500">{formatShortDate(match.scheduledAt)}</p>
            </div>
            <div className="flex gap-2 flex-wrap mb-3">
              {(match.participantIDs || []).map(uid => {
                const p = participantProfiles[uid]
                return (
                  <div key={uid} className="flex items-center gap-1.5 bg-gray-50 rounded-full px-2 py-1">
                    {p?.profilePic
                      ? <img src={p.profilePic} className="w-5 h-5 rounded-full object-cover" alt="" />
                      : <div className="w-5 h-5 rounded-full bg-brand flex items-center justify-center text-[9px] font-bold">{p?.username?.[0] || '?'}</div>
                    }
                    <span className="text-xs text-gray-700">{p?.username || uid.slice(0, 6)}</span>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleConfirmResult(match, 'win')}
                className="flex-1 bg-green-500 text-white rounded-xl py-2 text-sm font-bold"
              >
                I Won
              </button>
              <button
                onClick={() => handleConfirmResult(match, 'loss')}
                className="flex-1 bg-red-500 text-white rounded-xl py-2 text-sm font-bold"
              >
                I Lost
              </button>
              <button
                onClick={() => handleConfirmResult(match, 'other')}
                className="flex-1 bg-gray-200 text-gray-700 rounded-xl py-2 text-sm font-bold"
              >
                Other
              </button>
            </div>
          </div>
        ))}

        {/* Open / My Matches tab cards — skip Open tab when a court is selected (handled above) */}
        {activeTab !== 'Recent' && !(activeTab === 'Open' && selectedCourt) && viewMode === 'list' && !loading && filteredMatches.map(match => (
          <MatchCard
            key={match.id}
            match={match}
            participantProfiles={participantProfiles}
            myMatches={myMatches.length}
            location={location}
          />
        ))}
      </div>

      {showCreate && (
        <CreateMatchView
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            if (shouldShowAppPrompt()) setShowAppPrompt(true)
          }}
        />
      )}

      {showAppPrompt && (
        <AppDownloadPrompt onClose={() => setShowAppPrompt(false)} />
      )}

      {showFilter && (
        <MatchFilterSheet
          filters={filters}
          onApply={f => setFilters(f)}
          onClose={() => setShowFilter(false)}
        />
      )}
    </div>
  )
}
