import type { ReactNode } from 'react'

interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: string
  zIndex?: string
  className?: string
}

/**
 * Renders a shared modal dialog shell with backdrop click dismissal.
 * @param props - Dialog visibility, close handler, title, sizing, and body content
 * @returns Dialog element, or null when closed
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-sm',
  zIndex = 'z-50',
  className = '',
}: DialogProps) {
  if (!open) return null

  return (
    <div className={`fixed inset-0 ${zIndex} flex items-center justify-center bg-black/60`} onClick={onClose}>
      <div
        className={`bg-surface-1 border border-border rounded-lg shadow-xl ${maxWidth} w-full mx-4 p-5 ${className}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {title && <h3 className="text-sm font-semibold text-text-primary mb-3">{title}</h3>}
        {children}
      </div>
    </div>
  )
}
