import { useState, useRef } from 'react'
import { signInWithPopup, signInWithRedirect, GoogleAuthProvider } from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { v4 as uuidv4 } from 'uuid'
import { auth, db, storage } from '../lib/firebase'
import { reverseGeocodeCity } from '../lib/geocode'
import GreenCheckmark from './GreenCheckmark'

async function getCity() {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => reverseGeocodeCity(pos.coords.latitude, pos.coords.longitude).then(resolve),
      () => resolve(null),
      { timeout: 8000 }
    )
  })
}

export default function LoginScreen({ onDone }) {
  const [step, setStep] = useState('landing') // landing | username | profilePic | done
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [picPreview, setPicPreview] = useState(null)
  const [picFile, setPicFile] = useState(null)
  const [city, setCity] = useState(null)
  const fileRef = useRef()

  const afterSignIn = async (user) => {
    setCurrentUser(user)
    // Fetch city in parallel with the Firestore profile check
    const [userDoc, resolvedCity] = await Promise.all([
      getDoc(doc(db, 'Users', user.uid)),
      getCity(),
    ])
    if (resolvedCity) setCity(resolvedCity)
    if (!userDoc.exists() || !userDoc.data().username) {
      setStep('username')
    } else if (!userDoc.data().profilePic) {
      setStep('profilePic')
    } else {
      // Existing user — update city if not already set
      if (resolvedCity && !userDoc.data().city) {
        updateDoc(doc(db, 'Users', user.uid), { city: resolvedCity }).catch(() => {})
      }
      onDone?.()
    }
  }

  // Called synchronously from the button click — must stay non-async
  // so Safari preserves the user gesture for window.open (popup).
  const handleGoogleSignIn = () => {
    setLoading(true)
    const provider = new GoogleAuthProvider()
    signInWithPopup(auth, provider)
      .then(result => afterSignIn(result.user))
      .catch(err => {
        if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
          // Popup was blocked — fall back to redirect
          signInWithRedirect(auth, provider)
          return
        }
        console.error(err)
        alert('Sign in failed: ' + err.message)
        setLoading(false)
      })
  }

  const handleSaveUsername = async () => {
    if (!username.trim() || username.trim().length < 2) {
      setUsernameError('Username must be at least 2 characters.')
      return
    }
    setLoading(true)
    try {
      await setDoc(doc(db, 'Users', currentUser.uid), {
        userID: currentUser.uid,
        username: username.trim(),
        rating: 1000,
        matchesWon: 0,
        matchesLost: 0,
        profilePic: '',
        ...(city ? { city } : {}),
      })
      setStep('profilePic')
    } catch (err) {
      alert('Error saving username: ' + err.message)

    } finally {
      setLoading(false)
    }
  }

  const handlePickPhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPicFile(file)
    setPicPreview(URL.createObjectURL(file))
  }

  const handleUploadPic = async () => {
    if (!picFile) { onDone?.(); return }
    setLoading(true)
    try {
      const ext = picFile.name.split('.').pop()
      const storageRef = ref(storage, `profile_pictures/${uuidv4()}.${ext}`)
      await uploadBytes(storageRef, picFile)
      const url = await getDownloadURL(storageRef)
      await updateDoc(doc(db, 'Users', currentUser.uid), { profilePic: url })
      onDone?.()
    } catch (err) {
      alert('Error uploading photo: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  if (step === 'username') {
    return (
      <div className="flex flex-col items-center px-2">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold text-black mb-1">Choose a Username</h2>
          <p className="text-gray-500 text-sm mb-6">This is how other players will see you.</p>
          <input
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-black focus:outline-none focus:ring-2 focus:ring-brand mb-2"
            placeholder="e.g. ServeAce99"
            value={username}
            onChange={e => { setUsername(e.target.value); setUsernameError('') }}
            maxLength={24}
            onKeyDown={e => e.key === 'Enter' && handleSaveUsername()}
          />
          {usernameError && <p className="text-red-500 text-xs mb-3">{usernameError}</p>}
          <button
            className="w-full bg-black text-white rounded-xl py-3 font-bold mt-2 disabled:opacity-50"
            onClick={handleSaveUsername}
            disabled={loading}
          >
            {loading ? 'Saving…' : 'Continue'}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'profilePic') {
    return (
      <div className="flex flex-col items-center px-2">
        <div className="w-full max-w-sm flex flex-col items-center">
          <h2 className="text-2xl font-bold text-black mb-1">Profile Photo</h2>
          <p className="text-gray-500 text-sm mb-6">Add a photo so players can recognize you.</p>
          <div
            className="w-28 h-28 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer overflow-hidden mb-6"
            onClick={() => fileRef.current.click()}
          >
            {picPreview
              ? <img src={picPreview} className="w-full h-full object-cover" alt="preview" />
              : <span className="text-4xl text-gray-300">+</span>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePickPhoto} />
          <button
            className="w-full bg-black text-white rounded-xl py-3 font-bold disabled:opacity-50"
            onClick={handleUploadPic}
            disabled={loading}
          >
            {loading ? 'Uploading…' : picFile ? 'Save & Continue' : 'Skip'}
          </button>
        </div>
      </div>
    )
  }

  // Landing
  return (
    <div className="flex flex-col items-center px-2">
      <div className="flex flex-col items-center mb-12">
        <img src="/logo.png" alt="Play Tennis" className="h-20 object-contain mb-4" />
        <p className="text-black/70 mt-2 text-center text-base">Connect with local players. Find your match.</p>
      </div>

      <button
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="w-full max-w-xs bg-black text-white rounded-2xl py-4 font-bold text-base flex items-center justify-center gap-3 shadow-md active:scale-95 transition-transform disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        {loading ? 'Signing in…' : 'Continue with Google'}
      </button>

      <p className="text-black/50 text-xs mt-6 text-center">
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </p>
    </div>
  )
}
