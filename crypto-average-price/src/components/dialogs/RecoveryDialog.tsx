import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { loadSession, clearSession } from '../../utils/localStorage'
import { RotateCcw, X } from 'lucide-react'

/**
 * Dialog shown on app load when a previous session is found in localStorage.
 * Asks the user whether to restore the session or discard it.
 * @returns Recovery dialog element, or null if no session to restore
 */
export function RecoveryDialog() {
  const [savedSession] = useState<ReturnType<typeof loadSession>>(() => loadSession())
  const [dismissed, setDismissed] = useState(false)
  const restoreSession = useAppStore(s => s.restoreSession)
  const hasData = useAppStore(s => s.rawTransactions.length > 0)

  if (!savedSession || dismissed || hasData) return null

  const date = new Date(savedSession.timestamp)
  const formattedDate = date.toLocaleString()

  /**
   * Restores the saved session and dismisses the dialog.
   */
  function handleRestore() {
    restoreSession(savedSession!)
    setDismissed(true)
  }

  /**
   * Discards the saved session and dismisses the dialog.
   */
  function handleDiscard() {
    clearSession()
    setDismissed(true)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-2 border border-border rounded-xl p-6 max-w-md w-full shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <RotateCcw size={24} className="text-accent shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Recover Previous Session?</h2>
            <p className="text-sm text-text-secondary mt-1">
              A previous session was found from {formattedDate}.
              It contains {savedSession.rawTransactions.length} transactions.
            </p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={handleDiscard}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-text-secondary bg-surface-3 border border-border rounded-lg hover:text-text-primary hover:border-border-light transition-colors"
          >
            <X size={14} />
            Discard
          </button>
          <button
            onClick={handleRestore}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-accent rounded-lg hover:bg-accent-hover transition-colors"
          >
            <RotateCcw size={14} />
            Restore
          </button>
        </div>
      </div>
    </div>
  )
}
