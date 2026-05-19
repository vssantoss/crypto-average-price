import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { loadSession, clearSession } from '../../utils/localStorage'
import { Dialog, DialogFooter, dialogCancelClass, dialogPrimaryClass } from '../common/Dialog'
import { RotateCcw } from 'lucide-react'

export function RecoveryDialog() {
  const [savedSession] = useState<ReturnType<typeof loadSession>>(() => loadSession())
  const [dismissed, setDismissed] = useState(false)
  const restoreSession = useAppStore(s => s.restoreSession)
  const hasData = useAppStore(s => s.rawTransactions.length > 0)

  if (!savedSession || dismissed || hasData) return null

  const date = new Date(savedSession.timestamp)
  const formattedDate = date.toLocaleString()

  function handleRestore() {
    restoreSession(savedSession!)
    setDismissed(true)
  }

  function handleDiscard() {
    clearSession()
    setDismissed(true)
  }

  return (
    <Dialog open onClose={handleDiscard} maxWidth="max-w-md" className="p-6">
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
      <DialogFooter>
        <button
          onClick={handleDiscard}
          className={dialogCancelClass}
        >
          Discard
        </button>
        <button
          onClick={handleRestore}
          className={dialogPrimaryClass}
        >
          Restore
        </button>
      </DialogFooter>
    </Dialog>
  )
}
