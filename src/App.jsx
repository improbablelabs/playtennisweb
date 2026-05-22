import { useState, useEffect } from 'react'
import { useAuth } from './context/AuthContext'
import LoginScreen from './components/LoginScreen'
import MatchesFeedView from './components/MatchesFeedView'
import ProfileView from './components/ProfileView'
import RankingsView from './components/RankingsView'
import SkillQuizView from './components/SkillQuizView'
import BottomNav from './components/BottomNav'

export default function App() {
  const { firebaseUser, userProfile, profileLoading, authLoading, loginModalOpen, setLoginModalOpen, requireLogin } = useAuth()
  const [activeTab, setActiveTab] = useState('matches')
  const [showSkillQuiz, setShowSkillQuiz] = useState(false)

  // Force setup modal if authenticated but username not set
  useEffect(() => {
    if (!firebaseUser || profileLoading) return
    if (!userProfile?.username) {
      setLoginModalOpen(true)
    }
  }, [firebaseUser, userProfile, profileLoading])

  useEffect(() => {
    if (userProfile && userProfile.skillLevel === undefined) {
      setShowSkillQuiz(true)
    }
  }, [userProfile])

  // When a logged-in user switches to Profile or Rankings, no gate needed.
  // When a logged-out user taps Profile or Rankings, prompt login.
  const handleTabChange = (tab) => {
    if (!firebaseUser && (tab === 'profile' || tab === 'rankings')) {
      requireLogin()
      return
    }
    setActiveTab(tab)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-brand flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <main className="flex-1 overflow-hidden">
        {activeTab === 'matches' && <MatchesFeedView />}
        {activeTab === 'profile' && <ProfileView />}
        {activeTab === 'rankings' && <RankingsView />}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Skill quiz after first login */}
      {showSkillQuiz && (
        <div className="fixed inset-0 z-50">
          <SkillQuizView onComplete={() => setShowSkillQuiz(false)} />
        </div>
      )}

      {/* Login modal — shown when unauthenticated user tries a gated action */}
      {loginModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { if (!firebaseUser || userProfile?.username) setLoginModalOpen(false) }}
          />
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl mx-4">
            <LoginScreen onDone={() => setLoginModalOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
