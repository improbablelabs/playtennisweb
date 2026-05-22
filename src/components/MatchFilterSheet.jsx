import { useState } from 'react'

const SKILL_LEVELS = ['Any', 'beginner', 'intermediate', 'advanced']
const MATCH_TYPES = ['Any', 'singles', 'doubles', 'hitting']

export default function MatchFilterSheet({ filters, onApply, onClose }) {
  const [court, setCourt] = useState(filters.court || '')
  const [skillLevel, setSkillLevel] = useState(filters.skillLevel || 'Any')
  const [matchType, setMatchType] = useState(filters.matchType || 'Any')
  const [eloMin, setEloMin] = useState(filters.eloMin ?? 0)
  const [eloMax, setEloMax] = useState(filters.eloMax ?? 14000)

  const handleClear = () => {
    setCourt('')
    setSkillLevel('Any')
    setMatchType('Any')
    setEloMin(0)
    setEloMax(14000)
  }

  const handleApply = () => {
    onApply({ court, skillLevel, matchType, eloMin, eloMax })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div
        className="relative bg-white rounded-t-3xl w-full px-5 pt-5 pb-8 z-10 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-black">Filter Matches</h2>
          <button onClick={handleClear} className="text-sm text-gray-500 underline">Clear All</button>
        </div>

        {/* Court */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Court</label>
          <input
            type="text"
            placeholder="Court name (leave blank for all)"
            value={court}
            onChange={e => setCourt(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-1 focus:ring-black"
          />
        </div>

        {/* Skill Level */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Skill Level</label>
          <div className="flex gap-2 flex-wrap">
            {SKILL_LEVELS.map(s => (
              <button
                key={s}
                onClick={() => setSkillLevel(s)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  skillLevel === s
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {s === 'Any' ? 'Any' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Match Type */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">Match Type</label>
          <div className="flex gap-2 flex-wrap">
            {MATCH_TYPES.map(t => (
              <button
                key={t}
                onClick={() => setMatchType(t)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  matchType === t
                    ? 'bg-black text-white border-black'
                    : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {t === 'Any' ? 'Any' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* ELO Range */}
        <div className="mb-6">
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">
            ELO Range: {eloMin} – {eloMax}
          </label>
          <div className="flex gap-3 items-center">
            <input
              type="range" min={0} max={14000} step={100}
              value={eloMin}
              onChange={e => setEloMin(Math.min(Number(e.target.value), eloMax - 100))}
              className="flex-1 accent-black"
            />
            <input
              type="range" min={0} max={14000} step={100}
              value={eloMax}
              onChange={e => setEloMax(Math.max(Number(e.target.value), eloMin + 100))}
              className="flex-1 accent-black"
            />
          </div>
        </div>

        <button
          onClick={handleApply}
          className="w-full bg-black text-white rounded-2xl py-3.5 font-bold text-base"
        >
          Apply Filters
        </button>
      </div>
    </div>
  )
}
