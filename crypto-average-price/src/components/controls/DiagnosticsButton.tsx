import { useState } from 'react'
import { Dialog } from '../common/Dialog'
import { AlertTriangle, X } from 'lucide-react'

interface DiagnosticsButtonProps {
  messages: string[]
}

export function DiagnosticsButton({ messages }: DiagnosticsButtonProps) {
  const [showModal, setShowModal] = useState(false)

  if (messages.length === 0) return null

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1 text-xs text-warning hover:text-warning/80 transition-colors animate-pulse"
        title="Action needed"
      >
        <AlertTriangle size={14} />
      </button>

      {showModal && (
        <Dialog open={showModal} onClose={() => setShowModal(false)} maxWidth="max-w-md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-warning" />
              <h3 className="text-sm font-semibold text-text-primary">Action needed</h3>
            </div>
            <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-text-primary transition-colors">
              <X size={16} />
            </button>
          </div>

          <p className="text-xs text-text-secondary mb-3">
            The following items need attention for complete calculations:
          </p>

          <ul className="space-y-3">
            {messages.map((msg, i) => (
              <li key={i} className="flex gap-2 text-xs text-text-primary">
                <span className="text-warning mt-0.5 shrink-0">{i + 1}.</span>
                <span>{msg}</span>
              </li>
            ))}
          </ul>

          <div className="flex justify-end mt-5">
            <button
              onClick={() => setShowModal(false)}
              className="px-3 py-1.5 text-xs bg-surface-2 border border-border rounded hover:border-border-light text-text-secondary hover:text-text-primary transition-colors"
            >
              OK
            </button>
          </div>
        </Dialog>
      )}
    </>
  )
}
