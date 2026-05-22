const APP_STORE_URL = 'https://apps.apple.com/app/id6746813220'
const DISMISSED_KEY = 'appPromptDismissed'

export default function AppDownloadPrompt({ onClose }) {
  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    onClose()
  }

  const handleDownload = () => {
    localStorage.setItem(DISMISSED_KEY, '1')
    window.open(APP_STORE_URL, '_blank')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleDismiss} />
      <div className="relative bg-white rounded-3xl mx-4 w-full max-w-sm p-6 shadow-xl">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <img src="/logo.png" alt="Play Tennis" className="w-16 h-16 rounded-2xl shadow-md" />
        </div>

        <h2 className="text-xl font-black text-black text-center mb-2">
          Get notified when your match fills!
        </h2>
        <p className="text-sm text-gray-500 text-center mb-6">
          Download the Play Tennis app to receive push notifications the moment a player joins your match.
        </p>

        {/* App Store button */}
        <button
          onClick={handleDownload}
          className="w-full bg-black text-white rounded-2xl py-3.5 font-bold text-base flex items-center justify-center gap-2 mb-3"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
          Download on the App Store
        </button>

        <button
          onClick={handleDismiss}
          className="w-full text-sm text-gray-400 py-2"
        >
          Maybe later
        </button>
      </div>
    </div>
  )
}

export function shouldShowAppPrompt() {
  if (!/iPhone/i.test(navigator.userAgent)) return false
  if (localStorage.getItem(DISMISSED_KEY)) return false
  return true
}
