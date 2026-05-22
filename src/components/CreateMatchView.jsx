import { useState, useEffect, useRef } from 'react'
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { useLocation } from '../hooks/useLocation'
import { fetchNearbyCourts, searchCourtsByName } from '../lib/overpass'
import DropPinMap from './DropPinMap'
import CourtsMapView from './CourtsMapView'
import { getAvailableSlots, getMaxPlayersForType, haversineDistance } from '../lib/matchUtils'

const MATCH_TYPES = ['singles', 'doubles', 'hitting']

function today() {
  const d = new Date()
  d.setSeconds(0, 0)
  return d
}

function dateToInput(d) {
  return d.toISOString().slice(0, 10)
}

export default function CreateMatchView({ onClose, onCreated }) {
  const { firebaseUser, userProfile } = useAuth()
  const { location, requestLocation } = useLocation()

  const [courts, setCourts] = useState([])
  const [courtsLoading, setCourtsLoading] = useState(true)
  const [courtsError, setCourtsError] = useState(null)
  const [courtSearch, setCourtSearch] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showDropPin, setShowDropPin] = useState(false)
  const [courtViewMode, setCourtViewMode] = useState('list') // 'list' | 'map'

  const [selectedDate, setSelectedDate] = useState(dateToInput(today()))
  const [selectedCourt, setSelectedCourt] = useState(null)
  const [availableSlots, setAvailableSlots] = useState([])
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [duration, setDuration] = useState(60)
  const [matchType, setMatchType] = useState('singles')
  const [maxPlayers, setMaxPlayers] = useState(2)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const dateInputRef = useRef(null)

  // Request location on mount if not already available
  useEffect(() => {
    if (!location) requestLocation()
  }, [])

  // Fetch nearby courts from Overpass when location resolves
  useEffect(() => {
    if (!location) { console.log('[Courts] No location yet'); return }
    console.log('[Courts] Fetching courts at', location.lat, location.lon)
    setCourtsLoading(true)
    setCourtsError(null)
    fetchNearbyCourts(location.lat, location.lon)
      .then(results => {
        console.log('[Courts] Overpass returned', results.length, 'courts:', results.map(c => c.name))
        setCourts(results)
      })
      .catch(err => {
        console.error('[Courts] Overpass error:', err)
        setCourtsError('Could not load nearby courts.')
      })
      .finally(() => setCourtsLoading(false))
  }, [location?.lat, location?.lon])

  // Debounced global name search
  useEffect(() => {
    if (!courtSearch.trim()) { setSearchResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await searchCourtsByName(courtSearch)
        setSearchResults(results)
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 500)
    return () => clearTimeout(timer)
  }, [courtSearch])

  const displayedCourts = courtSearch.trim() ? searchResults : courts

  useEffect(() => {
    setMaxPlayers(getMaxPlayersForType(matchType))
  }, [matchType])

  useEffect(() => {
    if (!selectedCourt || !selectedDate) return
    loadSlots()
  }, [selectedCourt, selectedDate, duration])

  const loadSlots = async () => {
    setLoadingSlots(true)
    setSelectedSlot(null)
    try {
      // Fetch existing matches at this court on this date
      const dayStart = new Date(selectedDate)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(selectedDate)
      dayEnd.setHours(23, 59, 59, 999)

      const q = query(
        collection(db, 'Matches'),
        where('court.name', '==', selectedCourt.name),
        where('scheduledAt', '>=', Timestamp.fromDate(dayStart)),
        where('scheduledAt', '<=', Timestamp.fromDate(dayEnd)),
        where('status', '==', 'open')
      )
      const snap = await getDocs(q)
      const existing = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const slots = getAvailableSlots(selectedCourt, new Date(selectedDate), existing, duration)
      setAvailableSlots(slots)
    } catch (err) {
      console.error(err)
      setAvailableSlots([])
    } finally {
      setLoadingSlots(false)
    }
  }

  const handleSave = async () => {
    if (!selectedSlot) { alert('Please select a time slot.'); return }
    if (!firebaseUser) return
    if (!userProfile) return // still loading

    setSaving(true)
    try {
      const scheduledAt = Timestamp.fromDate(selectedSlot)
      const endTime = Timestamp.fromDate(new Date(selectedSlot.getTime() + duration * 60000))

      await addDoc(collection(db, 'Matches'), {
        hostID: firebaseUser.uid,
        createdAt: Timestamp.now(),
        scheduledAt,
        durationMinutes: duration,
        endTime,
        skillLevel: { kind: 'open' },
        hostSkillRating: userProfile.skillLevel ?? 0,
        matchType,
        court: {
          name: selectedCourt.name,
          geoPoint: { latitude: selectedCourt.lat, longitude: selectedCourt.lng },
          address: selectedCourt.name,
          totalCourts: selectedCourt.totalCourts,
          openHour: selectedCourt.openHour,
          closeHour: selectedCourt.closeHour,
          maxMatchDuration: selectedCourt.maxMatchDuration,
        },
        maxPlayers,
        participantIDs: [firebaseUser.uid],
        status: 'open',
        completed: false,
        resultConfirmations: {},
        notes,
        locationKey: selectedCourt.name,
        comments: [],
        lat: selectedCourt.lat,
        lon: selectedCourt.lng,
      })
      onCreated?.()
      onClose?.()
    } catch (err) {
      alert('Error creating match: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const formatSlot = (d) =>
    d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  const maxDuration = selectedCourt?.maxMatchDuration || 180

  return (<>
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-t-3xl w-full px-5 pt-5 pb-16 z-10 shadow-xl overflow-y-auto max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-black">Create Match</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-black">
            <svg viewBox="0 0 20 20" className="w-6 h-6" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Date */}
        <div className="mb-4" onClick={() => dateInputRef.current?.showPicker()}>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block pointer-events-none">Date</label>
          <input
            ref={dateInputRef}
            type="date"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-black cursor-pointer"
            value={selectedDate}
            min={dateToInput(today())}
            onChange={e => setSelectedDate(e.target.value)}
          />
        </div>

        {/* Court */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Court</label>

          {selectedCourt ? (
            <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 mb-2">
              <span className="text-sm font-semibold text-black truncate">{selectedCourt.name}</span>
              <button
                onClick={() => { setSelectedCourt(null); setCourtSearch('') }}
                className="text-xs text-gray-400 hover:text-black ml-2 shrink-0"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              {courtViewMode === 'map' ? (
                /* Map view */
                <div className="rounded-2xl overflow-hidden border border-gray-200" style={{ height: 260 }}>
                  <CourtsMapView
                    courts={courts}
                    openMatches={[]}
                    location={location}
                    selectedCourt={null}
                    onSelectCourt={court => {
                      if (court) { setSelectedCourt(court); setCourtSearch('') }
                    }}
                    visible={courtViewMode === 'map'}
                    onSearchArea={async (lat, lon) => {
                      setCourtsLoading(true)
                      const results = await fetchNearbyCourts(lat, lon).catch(() => [])
                      setCourts(results)
                      setCourtsLoading(false)
                    }}
                  />
                </div>
              ) : (
                /* List view */
                <>
                  <input
                    type="text"
                    placeholder="Search tennis courts…"
                    value={courtSearch}
                    onChange={e => setCourtSearch(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-black mb-2"
                  />
                  <button
                    onClick={() => setShowDropPin(true)}
                    className="w-full flex items-center justify-center gap-2 bg-black text-white rounded-xl py-2.5 text-sm font-semibold mb-2"
                  >
                    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor">
                      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                    </svg>
                    Don't see your court? Drop a Pin
                  </button>
                  {((!location || courtsLoading) && !courtSearch.trim()) && (
                    <div className="flex items-center gap-2 py-2 text-sm text-gray-400">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
                      {!location ? 'Getting your location…' : 'Finding courts near you…'}
                    </div>
                  )}
                  {searching && (
                    <div className="flex items-center gap-2 py-2 text-sm text-gray-400">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
                      Searching…
                    </div>
                  )}
                  {courtsError && !courtSearch.trim() && <p className="text-red-400 text-sm">{courtsError}</p>}
                  <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                    {displayedCourts.map(c => {
                      const distMi = location
                        ? haversineDistance(location.lat, location.lon, c.lat, c.lng).toFixed(1)
                        : null
                      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`
                      return (
                        <div key={c.name + c.lat} className="flex items-center gap-1">
                          <button
                            onClick={() => { setSelectedCourt(c); setCourtSearch('') }}
                            className="flex-1 text-left px-3 py-2.5 rounded-xl hover:bg-gray-50 border border-gray-100 text-sm font-medium text-black"
                          >
                            <span className="block truncate">{c.name}</span>
                            {distMi && <span className="text-xs text-gray-400 font-normal">{distMi} mi away</span>}
                          </button>
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="shrink-0 p-2 rounded-xl border border-gray-100 hover:bg-gray-50 text-gray-400 hover:text-black"
                            title="Open in Google Maps"
                          >
                            <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor">
                              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                            </svg>
                          </a>
                        </div>
                      )
                    })}
                    {!searching && courtSearch.trim() && searchResults.length === 0 && (
                      <p className="text-gray-400 text-sm py-2">No courts found for "{courtSearch}".</p>
                    )}
                    {!courtSearch.trim() && location && !courtsLoading && courts.length === 0 && !courtsError && (
                      <p className="text-gray-400 text-sm py-2">No courts found nearby.</p>
                    )}
                  </div>
                </>
              )}

              {/* List / Map toggle — below the court content */}
              <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5 mt-2 w-fit">
                <button
                  onClick={() => setCourtViewMode('list')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    courtViewMode === 'list' ? 'bg-black text-white' : 'text-gray-500'
                  }`}
                >
                  List
                </button>
                <button
                  onClick={() => setCourtViewMode('map')}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    courtViewMode === 'map' ? 'bg-black text-white' : 'text-gray-500'
                  }`}
                >
                  Map
                </button>
              </div>
            </>
          )}
        </div>

        {/* Duration */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
            Duration: {duration} min
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDuration(d => Math.max(30, d - 30))}
              className="w-9 h-9 rounded-full bg-gray-100 font-bold text-lg flex items-center justify-center"
            >−</button>
            <div className="flex-1 text-center font-semibold text-black">{duration} min</div>
            <button
              onClick={() => setDuration(d => Math.min(maxDuration, d + 30))}
              className="w-9 h-9 rounded-full bg-gray-100 font-bold text-lg flex items-center justify-center"
            >+</button>
          </div>
        </div>

        {/* Time Slots */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
            Available Times {loadingSlots && <span className="text-gray-400">(loading…)</span>}
          </label>
          {availableSlots.length === 0 && !loadingSlots ? (
            <p className="text-gray-400 text-sm">No available slots for this date/duration.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {availableSlots.map((slot, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedSlot(slot)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                    selectedSlot?.getTime() === slot.getTime()
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-black'
                  }`}
                >
                  {formatSlot(slot)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Match Type */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Match Type</label>
          <div className="flex gap-2">
            {MATCH_TYPES.map(t => (
              <button
                key={t}
                onClick={() => setMatchType(t)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  matchType === t
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Max Players (hitting only) */}
        {matchType === 'hitting' && (
          <div className="mb-4">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Max Players</label>
            <div className="flex gap-2">
              {[2, 3, 4].map(n => (
                <button
                  key={n}
                  onClick={() => setMaxPlayers(n)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    maxPlayers === n
                      ? 'bg-black text-white border-black'
                      : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="mb-6">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
            Notes <span className="text-gray-400 font-normal">({notes.length}/80)</span>
          </label>
          <textarea
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-black resize-none"
            placeholder="e.g. Looking for a casual rally session…"
            value={notes}
            onChange={e => setNotes(e.target.value.slice(0, 80))}
            rows={2}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !selectedSlot}
          className="w-full bg-black text-white rounded-2xl py-3.5 font-bold text-base disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create Match'}
        </button>
      </div>
    </div>

    {showDropPin && (
      <DropPinMap
        initialLat={location?.lat}
        initialLon={location?.lon}
        onClose={() => setShowDropPin(false)}
        onSelect={(court) => {
          setSelectedCourt(court)
          setShowDropPin(false)
          setCourtSearch('')
        }}
      />
    )}
  </>
  )
}
