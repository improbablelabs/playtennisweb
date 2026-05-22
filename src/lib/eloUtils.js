/**
 * Standard Elo rating calculation (K=20).
 * @param {number} player - Current player rating
 * @param {number} opponent - Opponent rating
 * @param {boolean} didWin - Whether the player won
 * @param {number} k - K-factor (default 20)
 * @returns {number} New rating
 */
export function newElo(player, opponent, didWin, k = 20) {
  const expected = 1 / (1 + Math.pow(10, (opponent - player) / 400))
  return player + Math.round(k * ((didWin ? 1 : 0) - expected))
}

/**
 * Update ratings for all participants in a match after result confirmation.
 * Handles both singles (2-player) and doubles (4-player).
 * @param {object} match - The TennisMatch document
 * @param {string} confirmingUID - The UID of the user who confirmed
 * @param {string} result - "win" | "loss" | "other"
 * @param {object} userProfiles - Map of uid -> UserProfile
 * @returns {Array<{uid, newRating}>} Array of rating updates
 */
export function computeRatingUpdates(match, confirmingUID, result, userProfiles) {
  const participants = match.participantIDs || []
  if (participants.length < 2) return []

  if (match.matchType === 'singles' && participants.length === 2) {
    const [p1, p2] = participants
    const r1 = userProfiles[p1]?.rating ?? 1000
    const r2 = userProfiles[p2]?.rating ?? 1000

    const p1Won = confirmingUID === p1 ? result === 'win' : result === 'loss'
    return [
      { uid: p1, newRating: newElo(r1, r2, p1Won) },
      { uid: p2, newRating: newElo(r2, r1, !p1Won) },
    ]
  }

  if (match.matchType === 'doubles' && participants.length === 4) {
    const team1 = [participants[0], participants[1]]
    const team2 = [participants[2], participants[3]]
    const avgTeam1 = (userProfiles[team1[0]]?.rating ?? 1000 + userProfiles[team1[1]]?.rating ?? 1000) / 2
    const avgTeam2 = (userProfiles[team2[0]]?.rating ?? 1000 + userProfiles[team2[1]]?.rating ?? 1000) / 2

    const isTeam1 = team1.includes(confirmingUID)
    const team1Won = isTeam1 ? result === 'win' : result === 'loss'

    return [
      ...team1.map(uid => ({ uid, newRating: newElo(userProfiles[uid]?.rating ?? 1000, avgTeam2, team1Won) })),
      ...team2.map(uid => ({ uid, newRating: newElo(userProfiles[uid]?.rating ?? 1000, avgTeam1, !team1Won) })),
    ]
  }

  return []
}
