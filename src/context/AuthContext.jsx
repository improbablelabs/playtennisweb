import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(undefined) // undefined = loading
  const [userProfile, setUserProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [redirectChecked, setRedirectChecked] = useState(false)
  const [loginModalOpen, setLoginModalOpen] = useState(false)

  // Wait for BOTH onAuthStateChanged AND getRedirectResult before considering auth resolved.
  // On mobile after a redirect, onAuthStateChanged can fire with null before Firebase
  // finishes processing the redirect result — keeping authLoading true until both
  // resolve prevents the brief "logged out" flash that triggers requireLogin.
  const authLoading = firebaseUser === undefined || !redirectChecked

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setFirebaseUser(user)
      if (!user) {
        setUserProfile(null)
        setProfileLoading(false)
      }
    })
    return unsub
  }, [])

  // Resolve any pending redirect (fallback for popup-blocked cases).
  // Keeps authLoading true until we know for sure whether a redirect was in flight.
  useEffect(() => {
    getRedirectResult(auth)
      .then(result => {
        if (!result) return
        // Came back from a redirect fallback — check if profile setup is needed
        getDoc(doc(db, 'Users', result.user.uid)).then(snap => {
          if (!snap.exists() || !snap.data().username) {
            setLoginModalOpen(true)
          }
        })
      })
      .catch(() => {})
      .finally(() => setRedirectChecked(true))
  }, [])

  useEffect(() => {
    if (!firebaseUser) return
    setProfileLoading(true)
    const ref = doc(db, 'Users', firebaseUser.uid)
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        setUserProfile({ userID: snap.id, ...snap.data() })
      } else {
        setUserProfile(null)
      }
      setProfileLoading(false)
    })
    return unsub
  }, [firebaseUser])

  const requireLogin = () => {
    if (!firebaseUser) {
      setLoginModalOpen(true)
      return true
    }
    return false
  }

  const value = {
    firebaseUser,
    userProfile,
    profileLoading,
    authLoading,
    loginModalOpen,
    setLoginModalOpen,
    requireLogin,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
