import { useState } from 'react'
import { doc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'

export default function MatchCommentsView({ match }) {
  const { userProfile, requireLogin } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const comments = match.comments || []
  const latestComment = comments[comments.length - 1]

  const sendComment = async () => {
    if (!text.trim() || !userProfile) return
    setSending(true)
    try {
      const comment = {
        id: uuidv4(),
        userID: userProfile.userID,
        username: userProfile.username,
        text: text.trim(),
        createdAt: Timestamp.now(),
      }
      await updateDoc(doc(db, 'Matches', match.id), {
        comments: arrayUnion(comment),
      })
      setText('')
    } catch (err) {
      alert('Error posting comment: ' + err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-xs text-gray-500 font-medium"
      >
        <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H6l-4 4V5z" />
        </svg>
        {comments.length} comment{comments.length !== 1 ? 's' : ''}
        {!expanded && latestComment && (
          <span className="text-gray-400 ml-1 truncate max-w-[160px]">
            · {latestComment.username}: {latestComment.text}
          </span>
        )}
        <svg
          viewBox="0 0 20 20"
          className={`w-3.5 h-3.5 ml-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {expanded && (
        <div className="mt-3">
          {comments.length === 0 && (
            <p className="text-gray-400 text-xs mb-2">No comments yet. Be the first!</p>
          )}
          <div className="flex flex-col gap-2 mb-3 max-h-40 overflow-y-auto">
            {[...comments]
              .sort((a, b) => {
                const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt)
                const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt)
                return ta - tb
              })
              .map(c => (
                <div key={c.id} className="flex gap-2 items-start">
                  <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-black">{c.username?.[0]?.toUpperCase() || '?'}</span>
                  </div>
                  <div className="flex-1">
                    <span className="text-xs font-semibold text-black mr-1">{c.username}</span>
                    <span className="text-xs text-gray-700">{c.text}</span>
                  </div>
                </div>
              ))}
          </div>
          {userProfile ? (
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-black"
                placeholder="Add a comment…"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendComment()}
                maxLength={200}
              />
              <button
                onClick={sendComment}
                disabled={sending || !text.trim()}
                className="bg-black text-white text-xs font-bold px-3 py-2 rounded-xl disabled:opacity-40"
              >
                Send
              </button>
            </div>
          ) : (
            <button
              onClick={requireLogin}
              className="w-full text-xs text-gray-500 border border-gray-200 rounded-xl py-2 hover:border-black hover:text-black transition-colors"
            >
              Sign in to comment
            </button>
          )}
        </div>
      )}
    </div>
  )
}
