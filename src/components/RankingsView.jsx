import { useState, useEffect, useRef } from 'react'
import { collection, query, orderBy, limit, getDocs, where, doc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import { useLocation } from '../hooks/useLocation'
import { reverseGeocodeCity } from '../lib/geocode'

function MedalIcon({ rank }) {
  if (rank === 1) return <span className="text-xl">🥇</span>
  if (rank === 2) return <span className="text-xl">🥈</span>
  if (rank === 3) return <span className="text-xl">🥉</span>
  return <span className="text-sm font-bold text-gray-400 w-7 text-center">#{rank}</span>
}


export default function RankingsView() {
  const { userProfile, firebaseUser } = useAuth()
  const { location, requestLocation } = useLocation()
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('global') // 'global' | 'local'
  const [userCity, setUserCity] = useState(null)
  const [cityLoading, setCityLoading] = useState(false)
  const cityFetchedRef = useRef(false)

  // Fetch and cache city from location
  useEffect(() => {
    if (!location || cityFetchedRef.current) return
    if (userProfile?.city) {
      setUserCity(userProfile.city)
      cityFetchedRef.current = true
      return
    }
    cityFetchedRef.current = true
    setCityLoading(true)
    reverseGeocodeCity(location.lat, location.lon).then(city => {
      console.log('[Rankings] My city:', city)
      if (!city) return
      setUserCity(city)
      if (firebaseUser) {
        updateDoc(doc(db, 'Users', firebaseUser.uid), { city }).catch(() => {})
      }
    }).finally(() => setCityLoading(false))
  }, [location, userProfile?.city])

  // Fetch rankings whenever mode or city changes
  useEffect(() => {
    if (mode === 'local' && !userCity) return
    setLoading(true)
    const fetchRankings = async () => {
      try {
        let q
        if (mode === 'local' && userCity) {
          q = query(
            collection(db, 'Users'),
            where('city', '==', userCity),
            orderBy('rating', 'desc'),
            limit(50)
          )
        } else {
          q = query(
            collection(db, 'Users'),
            orderBy('rating', 'desc'),
            limit(50)
          )
        }
        const snap = await getDocs(q)
        const fetched = snap.docs.map((d, i) => ({ rank: i + 1, userID: d.id, ...d.data() }))
        console.log(`[Rankings] Mode: ${mode} | ${fetched.length} players`)
        fetched.forEach(p => console.log(`  #${p.rank} ${p.username} — city: ${p.city ?? '(none)'} — ELO: ${p.rating}`))
        setPlayers(fetched)
      } catch (err) {
        console.error('Rankings error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchRankings()
  }, [mode, userCity])

  const handleLocalPress = () => {
    if (!location) requestLocation()
    setMode('local')
  }

  return (
    <div className="flex flex-col h-full bg-brand overflow-y-auto pb-24">
      <div className="px-4 pt-16 pb-4">
        <h1 className="text-2xl font-black text-black mb-1">Rankings</h1>
        <p className="text-black/60 text-sm mb-4">Top 50 players by ELO rating</p>

        {/* Mode toggle */}
        <div className="flex bg-black/10 rounded-xl p-1 gap-1 mb-5">
          <button
            onClick={() => setMode('global')}
            className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              mode === 'global' ? 'bg-black text-white shadow-sm' : 'text-black/70'
            }`}
          >
            Global
          </button>
          <button
            onClick={handleLocalPress}
            className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
              mode === 'local' ? 'bg-black text-white shadow-sm' : 'text-black/70'
            }`}
          >
            {cityLoading ? (
              <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
            )}
            {userCity && mode === 'local' ? userCity : 'Near Me'}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
          </div>
        ) : players.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-2">
            <p className="text-black font-semibold">
              {mode === 'local' ? `No players found in ${userCity}` : 'No players yet'}
            </p>
            <p className="text-black/60 text-sm">
              {mode === 'local' ? 'Try the global rankings.' : 'Be the first to play a match!'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Top 3 podium */}
            {players.length >= 3 && (
              <div className="bg-white rounded-2xl shadow-sm p-4 mb-2">
                <div className="flex items-end justify-center gap-2">
                  {/* 2nd */}
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-100 border-2 border-gray-300">
                      {players[1]?.profilePic
                        ? <img src={players[1].profilePic} className="w-full h-full object-cover" alt="" />
                        : <div className="w-full h-full bg-gray-200 flex items-center justify-center font-bold text-gray-600">
                            {players[1]?.username?.[0]?.toUpperCase()}
                          </div>
                      }
                    </div>
                    <p className="text-xs font-semibold text-black truncate max-w-[72px] text-center">{players[1]?.username}</p>
                    <div className="bg-gray-100 text-gray-700 text-xs font-bold px-2 py-0.5 rounded-full">{players[1]?.rating}</div>
                    <div className="w-full bg-gray-200 rounded-t-xl flex items-center justify-center" style={{ height: 64 }}>
                      <span className="text-2xl">🥈</span>
                    </div>
                  </div>
                  {/* 1st */}
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-brand border-2 border-brand shadow-md">
                      {players[0]?.profilePic
                        ? <img src={players[0].profilePic} className="w-full h-full object-cover" alt="" />
                        : <div className="w-full h-full bg-brand flex items-center justify-center font-black text-black text-xl">
                            {players[0]?.username?.[0]?.toUpperCase()}
                          </div>
                      }
                    </div>
                    <p className="text-xs font-bold text-black truncate max-w-[80px] text-center">{players[0]?.username}</p>
                    <div className="bg-brand text-black text-xs font-bold px-2 py-0.5 rounded-full">{players[0]?.rating}</div>
                    <div className="w-full bg-brand rounded-t-xl flex items-center justify-center" style={{ height: 88 }}>
                      <span className="text-3xl">🥇</span>
                    </div>
                  </div>
                  {/* 3rd */}
                  <div className="flex flex-col items-center gap-1 flex-1">
                    <div className="w-14 h-14 rounded-full overflow-hidden bg-gray-100 border-2 border-orange-300">
                      {players[2]?.profilePic
                        ? <img src={players[2].profilePic} className="w-full h-full object-cover" alt="" />
                        : <div className="w-full h-full bg-orange-50 flex items-center justify-center font-bold text-orange-500">
                            {players[2]?.username?.[0]?.toUpperCase()}
                          </div>
                      }
                    </div>
                    <p className="text-xs font-semibold text-black truncate max-w-[72px] text-center">{players[2]?.username}</p>
                    <div className="bg-orange-100 text-orange-600 text-xs font-bold px-2 py-0.5 rounded-full">{players[2]?.rating}</div>
                    <div className="w-full bg-orange-100 rounded-t-xl flex items-center justify-center" style={{ height: 48 }}>
                      <span className="text-2xl">🥉</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Full list */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
              {players.map((player, i) => {
                const isMe = player.userID === userProfile?.userID
                return (
                  <div
                    key={player.userID}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      i < players.length - 1 ? 'border-b border-gray-50' : ''
                    } ${isMe ? 'bg-brand/20' : ''}`}
                  >
                    <div className="w-7 flex items-center justify-center shrink-0">
                      <MedalIcon rank={player.rank} />
                    </div>
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100 shrink-0">
                      {player.profilePic
                        ? <img src={player.profilePic} className="w-full h-full object-cover" alt="" />
                        : <div className="w-full h-full flex items-center justify-center font-bold text-gray-500">
                            {player.username?.[0]?.toUpperCase() || '?'}
                          </div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm truncate ${isMe ? 'text-black' : 'text-gray-900'}`}>
                        {player.username || 'Anonymous'}
                        {isMe && <span className="text-xs text-gray-500 ml-1 font-normal">(you)</span>}
                      </p>
                      <p className="text-xs text-gray-400">
                        {(player.matchesWon ?? 0) + (player.matchesLost ?? 0)} matches played
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-black text-black text-base">{player.rating ?? 1000}</p>
                      <p className="text-[10px] text-gray-400">ELO</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
