import { useState, useRef, useEffect } from 'react'
import { Pencil } from 'lucide-react'

/**
 * Props for the EditableCell component.
 */
interface EditableCellProps {
  value: string
  editValue?: string
  editPlaceholder?: string
  onSave: (value: string) => void
  placeholder?: string
  className?: string
  showIcon?: boolean
}

/**
 * An inline-editable cell for the datatable.
 * Click to edit, Enter to save, Escape to cancel.
 * @param props - Component props
 * @returns Editable cell element
 */
export function EditableCell({
  value,
  editValue,
  editPlaceholder,
  onSave,
  placeholder,
  className,
  showIcon = true,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(editValue ?? value)
  const inputRef = useRef<HTMLInputElement>(null)
  const editableValue = editValue ?? value

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  /**
   * Commits the current draft value and exits edit mode.
   */
  function handleSave() {
    setEditing(false)
    if (draft !== editableValue) {
      onSave(draft)
    }
  }

  /**
   * Discards changes and exits edit mode.
   */
  function handleCancel() {
    setEditing(false)
    setDraft(editableValue)
  }

  /**
   * Handles keyboard events for save (Enter) and cancel (Escape).
   */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        placeholder={editPlaceholder ?? placeholder}
        onChange={e => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`w-full bg-surface-3 border border-accent/50 rounded px-1.5 py-0.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent ${className || ''}`}
      />
    )
  }

  return (
    <div
      className={`group flex items-center gap-1 cursor-pointer min-h-[24px] rounded px-1.5 py-0.5 hover:bg-surface-3/50 ${className || ''}`}
      onClick={() => {
        setDraft(editableValue)
        setEditing(true)
      }}
      title="Click to edit"
    >
      <span className={`text-xs truncate ${value ? 'text-text-primary' : 'text-text-muted italic'}`}>
        {value || placeholder || '—'}
      </span>
      {showIcon && (
        <Pencil size={12} className="shrink-0 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </div>
  )
}
