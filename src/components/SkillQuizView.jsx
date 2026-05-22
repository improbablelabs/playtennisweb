import { useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../context/AuthContext'

const QUESTIONS = [
  {
    prompt: 'How reliable is your serve?',
    choices: [
      "I rarely get my serve in",
      "Some serves go in, not much control",
      "Usually in, can aim a little",
      "Can place it with spin or direction",
      "Strong and accurate serves even in tough points",
    ],
  },
  {
    prompt: 'Can you keep the ball going from the back of the court?',
    choices: [
      "I struggle to keep it in",
      "A few hits, then I miss",
      "I can rally on both sides",
      "Confident rallies with control and spin",
      "Long rallies with power and accuracy",
    ],
  },
  {
    prompt: 'How are you at the net?',
    choices: [
      "I avoid going to the net",
      "I go up sometimes but miss easy shots",
      "I can hit basic volleys",
      "Comfortable finishing points at the net",
      "Confident and aggressive at the net",
    ],
  },
  {
    prompt: 'How well do you return serves?',
    choices: [
      "I often miss the return",
      "I can return slower serves",
      "I place returns fairly well",
      "I handle most serves and direct them back",
      "I attack even strong serves",
    ],
  },
  {
    prompt: 'How steady are you when the game gets close?',
    choices: [
      "I miss a lot when it matters",
      "I get nervous and make more mistakes",
      "I play about the same as usual",
      "I stay calm and make smart shots",
      "I play my best when it counts",
    ],
  },
  {
    prompt: 'How much match experience do you have?',
    choices: [
      "I've never played a match",
      "A few friendly games",
      "Local clubs or league matches",
      "Regular tournaments or strong leagues",
      "College or national-level matches",
    ],
  },
]

const WEIGHTS = [1.2, 1.0, 0.9, 1.0, 1.0, 1.3]

function calcRating(answers) {
  const filled = answers
    .map((val, idx) => val !== null ? { val, weight: WEIGHTS[idx] } : null)
    .filter(Boolean)
  if (!filled.length) return 2.0
  const weightSum = filled.reduce((s, x) => s + x.weight, 0)
  const weightedAvg = filled.reduce((s, x) => s + x.val * x.weight, 0) / weightSum
  const mapped = 1.0 + weightedAvg * 1.5
  const rounded = Math.round(mapped * 2) / 2
  return Math.min(Math.max(rounded, 1.0), 7.0)
}

// ── Sub-views ────────────────────────────────────────────────────────────────

function KnowsRatingScreen({ onEnterRating, onTakeQuiz }) {
  const [input, setInput] = useState('')
  const valid = !isNaN(parseFloat(input)) && input.trim() !== ''

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-bold text-black mb-1">Do you already know your USTA Rating?</h2>
        <p className="text-gray-500 text-sm">Enter it below, or take a short quiz to find out.</p>
      </div>
      <input
        type="number"
        step="0.5"
        min="1"
        max="7"
        placeholder="e.g. 3.5"
        value={input}
        onChange={e => setInput(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-black text-lg focus:outline-none focus:ring-2 focus:ring-black"
      />
      <button
        onClick={() => valid ? onEnterRating(parseFloat(input)) : onTakeQuiz()}
        className="w-full bg-black text-white rounded-xl py-3.5 font-bold text-base"
      >
        {valid ? 'Set My Rating' : "I Don't Know — Take Quiz"}
      </button>
    </div>
  )
}

function QuestionCard({ question, selected, onSelect }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-lg font-bold text-black mb-1">{question.prompt}</h3>
      {question.choices.map((choice, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all ${
            selected === i
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 bg-white hover:border-gray-400'
          }`}
        >
          <span className="text-sm text-black">{choice}</span>
          {selected === i && (
            <svg viewBox="0 0 20 20" className="w-5 h-5 text-green-500 shrink-0 ml-2" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      ))}
    </div>
  )
}

function ResultScreen({ rating, onConfirm }) {
  return (
    <div className="flex flex-col items-center gap-5 py-4">
      <div>
        <h2 className="text-2xl font-bold text-black text-center mb-1">Estimated USTA Level</h2>
        <p className="text-gray-500 text-sm text-center">Based on your quiz answers. You can update this anytime from your profile.</p>
      </div>
      <div className="text-8xl font-black text-black leading-none">{rating.toFixed(1)}</div>
      <button
        onClick={onConfirm}
        className="w-full bg-black text-white rounded-xl py-3.5 font-bold text-base"
      >
        Confirm Level
      </button>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function SkillQuizView({ onComplete }) {
  const { firebaseUser } = useAuth()
  const [screen, setScreen] = useState('know') // know | quiz | result
  const [answers, setAnswers] = useState(Array(QUESTIONS.length).fill(null))
  const [currentQ, setCurrentQ] = useState(0)
  const [saving, setSaving] = useState(false)

  const rating = calcRating(answers)

  const saveRating = async (value) => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'Users', firebaseUser.uid), { skillLevel: value })
      onComplete?.()
    } catch (err) {
      alert('Error saving skill level: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleNext = () => {
    if (currentQ < QUESTIONS.length - 1) {
      setCurrentQ(q => q + 1)
    } else {
      setScreen('result')
    }
  }

  return (
    <div className="min-h-screen bg-brand flex flex-col items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm">

        {screen === 'know' && (
          <KnowsRatingScreen
            onEnterRating={val => saveRating(val)}
            onTakeQuiz={() => setScreen('quiz')}
          />
        )}

        {screen === 'quiz' && (
          <div className="flex flex-col gap-5">
            {/* Progress */}
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                <div
                  className="bg-black h-1.5 rounded-full transition-all"
                  style={{ width: `${((currentQ + 1) / QUESTIONS.length) * 100}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 shrink-0">{currentQ + 1}/{QUESTIONS.length}</span>
            </div>

            <QuestionCard
              question={QUESTIONS[currentQ]}
              selected={answers[currentQ]}
              onSelect={i => {
                const next = [...answers]
                next[currentQ] = i
                setAnswers(next)
              }}
            />

            <div className="flex gap-2">
              {currentQ > 0 && (
                <button
                  onClick={() => setCurrentQ(q => q - 1)}
                  className="px-4 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
                >
                  Back
                </button>
              )}
              <button
                onClick={handleNext}
                disabled={answers[currentQ] === null}
                className="flex-1 bg-black text-white rounded-xl py-3 font-bold text-base disabled:opacity-30 transition-opacity"
              >
                {currentQ === QUESTIONS.length - 1 ? 'Finish' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {screen === 'result' && (
          <ResultScreen
            rating={rating}
            onConfirm={() => saveRating(rating)}
          />
        )}

        {saving && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-2xl">
            <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}
