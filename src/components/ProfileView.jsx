import { useState, useEffect } from 'react'
import { signOut, deleteUser } from 'firebase/auth'
import { doc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'
import EditProfileView from './EditProfileView'

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-2xl p-4 flex flex-col items-center gap-1 shadow-sm">
      <span className="text-2xl font-black text-black leading-tight">{value}</span>
      <span className="text-xs text-gray-500 text-center">{label}</span>
    </div>
  )
}

function useAnimatedValue(target) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    setValue(0)
    if (!target) return
    let current = 0
    const interval = setInterval(() => {
      if (current < target) {
        current += Math.max(1, Math.ceil((target - current) / 10))
        setValue(Math.min(current, target))
      } else {
        clearInterval(interval)
      }
    }, 20)
    return () => clearInterval(interval)
  }, [target])
  return value
}

export default function ProfileView() {
  const { firebaseUser, userProfile } = useAuth()
  const [showEdit, setShowEdit] = useState(false)
  const [showAccountSheet, setShowAccountSheet] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [stats, setStats] = useState({
    matchesPlayed: 0, matchesHosted: 0,
    totalMinutes: 0, matchesThisMonth: 0, lastMatchDate: null,
  })

  // Load extra stats from Matches collection
  useEffect(() => {
    if (!firebaseUser) return
    const load = async () => {
      const snap = await getDocs(query(
        collection(db, 'Matches'),
        where('participantIDs', 'array-contains', firebaseUser.uid)
      ))
      const matches = snap.docs.map(d => d.data())
      const now = new Date()
      setStats({
        matchesPlayed: matches.length,
        matchesHosted: matches.filter(m => m.hostID === firebaseUser.uid).length,
        totalMinutes: matches.reduce((sum, m) => sum + (m.durationMinutes ?? 0), 0),
        matchesThisMonth: matches.filter(m => {
          const d = m.scheduledAt?.toDate?.()
          return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
        }).length,
        lastMatchDate: matches
          .map(m => m.scheduledAt?.toDate?.())
          .filter(Boolean)
          .sort((a, b) => b - a)[0] ?? null,
      })
    }
    load()
  }, [firebaseUser])

  const wins = useAnimatedValue(userProfile?.matchesWon ?? 0)
  const losses = useAnimatedValue(userProfile?.matchesLost ?? 0)
  const played = useAnimatedValue(stats.matchesPlayed)
  const hosted = useAnimatedValue(stats.matchesHosted)
  const minutes = useAnimatedValue(stats.totalMinutes)
  const thisMonth = useAnimatedValue(stats.matchesThisMonth)

  const lastMatchStr = stats.lastMatchDate
    ? stats.lastMatchDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut(auth)
      setShowAccountSheet(false)
    } catch (err) {
      alert(err.message)
      setSigningOut(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return }
    try {
      await deleteDoc(doc(db, 'Users', firebaseUser.uid))
      await deleteUser(firebaseUser)
    } catch (err) {
      alert('Error deleting account: ' + err.message)
    }
    setConfirmDelete(false)
  }

  return (
    <div className="flex flex-col h-full bg-brand overflow-y-auto pb-24">
      <div className="px-4 pt-14 pb-4">
        <h1 className="text-2xl font-black text-black mb-4">My Profile</h1>

        {/* Profile card */}
        <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-3 mb-4">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-brand shrink-0">
            {userProfile?.profilePic
              ? <img src={userProfile.profilePic} className="w-full h-full object-cover" alt="profile" />
              : <div className="w-full h-full flex items-center justify-center">
                  <span className="text-xl font-black text-black">{userProfile?.username?.[0]?.toUpperCase() || '?'}</span>
                </div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-black text-lg leading-tight truncate">{userProfile?.username || 'Player'}</p>
            <p className="text-xs text-gray-400">ELO {userProfile?.rating ?? 1000}</p>
          </div>
          <button onClick={() => setShowEdit(true)} className="p-2">
            <svg viewBox="0 0 20 20" className="w-6 h-6 text-black" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </button>
          <button onClick={() => setShowAccountSheet(true)} className="p-2">
            <svg viewBox="0 0 20 20" className="w-6 h-6 text-black" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <StatCard label="Wins" value={wins} />
          <StatCard label="Losses" value={losses} />
          <StatCard label="Matches Played" value={played} />
          <StatCard label="Matches Hosted" value={hosted} />
          <StatCard label="Minutes Played" value={minutes} />
          <StatCard label="Matches This Month" value={thisMonth} />
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm text-center mb-4">
          <span className="text-xs text-gray-500 block">Last Match</span>
          <span className="font-black text-black">{lastMatchStr}</span>
        </div>
      </div>

      {/* Account sheet */}
      {showAccountSheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowAccountSheet(false); setConfirmDelete(false) }} />
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl mx-4">
            <h3 className="text-lg font-bold text-black mb-6 text-center">Account</h3>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full bg-black text-white rounded-2xl py-3.5 font-bold disabled:opacity-50"
              >
                {signingOut ? 'Signing Out…' : 'Sign Out'}
              </button>
              <button
                onClick={handleDeleteAccount}
                className={`w-full rounded-2xl py-3.5 font-bold border transition-colors ${
                  confirmDelete
                    ? 'bg-red-500 text-white border-red-500'
                    : 'bg-white text-red-500 border-red-200'
                }`}
              >
                {confirmDelete ? 'Tap again to confirm' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEdit && <EditProfileView onClose={() => setShowEdit(false)} />}
    </div>
  )
}
