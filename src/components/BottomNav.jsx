export default function BottomNav({ activeTab, onTabChange }) {
  const tabs = [
    {
      key: 'matches',
      label: 'Matches',
      icon: (active) => active
        ? <img src="/logo.png" alt="Matches" className="w-6 h-6 object-contain" />
        : (
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2 C12 2 8 6 8 12 C8 18 12 22 12 22" />
            <path d="M12 2 C12 2 16 6 16 12 C16 18 12 22 12 22" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M4 7 Q12 9 20 7" />
            <path d="M4 17 Q12 15 20 17" />
          </svg>
        ),
    },
    {
      key: 'profile',
      label: 'Profile',
      icon: (active) => (
        <svg viewBox="0 0 24 24" className={`w-6 h-6 ${active ? 'text-black' : 'text-gray-500'}`} fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20 C4 16 7.6 13 12 13 C16.4 13 20 16 20 20" />
        </svg>
      ),
    },
    {
      key: 'rankings',
      label: 'Rankings',
      icon: (active) => (
        <svg viewBox="0 0 24 24" className={`w-6 h-6 ${active ? 'text-black' : 'text-gray-500'}`} fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="12" width="4" height="9" rx="1" />
          <rect x="10" y="7" width="4" height="14" rx="1" />
          <rect x="17" y="3" width="4" height="18" rx="1" />
        </svg>
      ),
    },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
      <div className="flex">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={`flex-1 flex flex-col items-center py-2 gap-0.5 transition-colors ${
              activeTab === tab.key ? 'text-black' : 'text-gray-500'
            }`}
          >
            {tab.icon(activeTab === tab.key)}
            <span className={`text-xs font-medium ${activeTab === tab.key ? 'text-black' : 'text-gray-500'}`}>
              {tab.label}
            </span>
            {activeTab === tab.key && (
              <div className="w-1 h-1 rounded-full bg-brand mt-0.5" />
            )}
          </button>
        ))}
      </div>
      <div className="h-safe-bottom" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
    </nav>
  )
}
