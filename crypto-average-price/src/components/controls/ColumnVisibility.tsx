import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { createColumns } from '../table/columns'
import { Columns3, X } from 'lucide-react'

/**
 * Panel to toggle visibility of individual datatable columns.
 * Opens as a dropdown when clicked.
 * @returns Column visibility toggle button and dropdown
 */
export function ColumnVisibility() {
  const [open, setOpen] = useState(false)
  const visibility = useAppStore(s => s.settings.columnVisibility)
  const setVisibility = useAppStore(s => s.setColumnVisibility)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 bg-surface-2 border border-border rounded px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
      >
        <Columns3 size={13} />
        Columns
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 right-0 z-[60] bg-surface-2 border border-border rounded-lg shadow-lg p-3 min-w-[200px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">Toggle Columns</span>
              <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary">
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
              {createColumns(0).map(col => {
                const id = (col as { accessorKey?: string }).accessorKey || ''
                if (!id) return null
                const isVisible = visibility[id] !== false
                return (
                  <label key={id} className="flex items-center gap-2 cursor-pointer py-0.5 px-1 rounded hover:bg-surface-3">
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={e => setVisibility(id, e.target.checked)}
                      className="accent-accent"
                    />
                    <span className="text-sm text-text-primary">
                      {typeof col.header === 'string' ? col.header : id}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
