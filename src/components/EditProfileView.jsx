import { useState, useRef } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { v4 as uuidv4 } from 'uuid'
import { db, storage } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'

export default function EditProfileView({ onClose }) {
  const { firebaseUser, userProfile } = useAuth()

  const [username, setUsername] = useState(userProfile?.username ?? '')
  const [skillLevel, setSkillLevel] = useState(userProfile?.skillLevel ?? 3.0)
  const [picPreview, setPicPreview] = useState(null)
  const [picFile, setPicFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef()

  const roundedSkill = (v) => Math.round(v * 2) / 2

  const hasChanges =
    (username.trim() && username.trim() !== userProfile?.username) ||
    roundedSkill(skillLevel) !== (userProfile?.skillLevel ?? -1) ||
    picFile !== null

  const handlePickPhoto = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPicFile(file)
    setPicPreview(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    if (!firebaseUser) return
    setSaving(true)
    setError(null)
    const updates = {}

    const trimmed = username.trim()
    if (trimmed && trimmed !== userProfile?.username) updates.username = trimmed

    const newSkill = roundedSkill(skillLevel)
    if (newSkill !== (userProfile?.skillLevel ?? -1)) updates.skillLevel = newSkill

    if (picFile) {
      try {
        const ext = picFile.name.split('.').pop()
        const storageRef = ref(storage, `profile_pictures/${uuidv4()}.${ext}`)
        await uploadBytes(storageRef, picFile)
        updates.profilePic = await getDownloadURL(storageRef)
      } catch (err) {
        setError('Failed to upload picture: ' + err.message)
        setSaving(false)
        return
      }
    }

    if (Object.keys(updates).length > 0) {
      try {
        await updateDoc(doc(db, 'Users', firebaseUser.uid), updates)
      } catch (err) {
        setError('Save failed: ' + err.message)
        setSaving(false)
        return
      }
    }

    setSaving(false)
    onClose()
  }

  const currentPic = picPreview ?? userProfile?.profilePic

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-3xl p-6 shadow-xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-black">Edit Profile</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-black">
            <svg viewBox="0 0 20 20" className="w-6 h-6" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Profile picture */}
        <div className="flex justify-center mb-6">
          <div className="relative cursor-pointer" onClick={() => fileRef.current.click()}>
            <div className="w-28 h-28 rounded-full overflow-hidden bg-gray-100">
              {currentPic
                ? <img src={currentPic} className="w-full h-full object-cover" alt="profile" />
                : <div className="w-full h-full bg-brand flex items-center justify-center">
                    <span className="text-4xl font-black text-black">{userProfile?.username?.[0]?.toUpperCase() || '?'}</span>
                  </div>
              }
            </div>
            <div className="absolute bottom-0 right-0 bg-black rounded-full w-8 h-8 flex items-center justify-center border-2 border-white">
              <svg viewBox="0 0 20 20" className="w-4 h-4 text-white" fill="currentColor">
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePickPhoto} />
        </div>

        {/* Username */}
        <div className="mb-5">
          <label className="text-sm font-semibold text-black block mb-2">Username</label>
          <input
            className="w-full bg-gray-100 rounded-xl px-4 py-3 text-black focus:outline-none focus:ring-2 focus:ring-black"
            value={username}
            onChange={e => setUsername(e.target.value)}
            maxLength={24}
            autoCorrect="off"
            autoCapitalize="none"
          />
        </div>

        {/* Skill level slider */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <label className="text-sm font-semibold text-black">Skill Level</label>
            <span className="text-sm font-bold text-black">{roundedSkill(skillLevel).toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={1} max={7} step={0.5}
            value={skillLevel}
            onChange={e => setSkillLevel(parseFloat(e.target.value))}
            className="w-full accent-black"
          />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-gray-400">Beginner</span>
            <span className="text-xs text-gray-400">Intermediate</span>
            <span className="text-xs text-gray-400">Advanced</span>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}

        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="w-full bg-black text-white rounded-2xl py-3.5 font-bold disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
