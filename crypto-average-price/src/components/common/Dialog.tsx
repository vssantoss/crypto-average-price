import type { ReactNode, PropsWithChildren } from 'react'

/** Cancel/dismiss button style for dialog footers. */
export const dialogCancelClass = 'px-3 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors'

/** Primary action button style for dialog footers (accent-colored). */
export const dialogPrimaryClass = 'px-3 py-1.5 text-xs bg-accent/20 border border-accent/40 rounded text-accent hover:bg-accent/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

/** Secondary action button style for dialog footers (neutral/subtle). */
export const dialogSecondaryClass = 'px-3 py-1.5 text-xs bg-surface-2 border border-border rounded text-text-secondary hover:text-text-primary hover:border-border-light transition-colors'

/** Destructive action button style for dialog footers (danger-colored). */
export const dialogDangerClass = 'px-3 py-1.5 text-xs bg-danger/20 border border-danger/40 rounded text-danger hover:bg-danger/30 transition-colors'

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

/** Standard footer layout for dialog action buttons. */
export function DialogFooter({ children }: PropsWithChildren) {
  return <div className="flex gap-2 justify-end mt-4">{children}</div>
}
