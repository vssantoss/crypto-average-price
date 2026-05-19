import { useEffect, useMemo, useState } from 'react'
import { useAppStore, defaultColumnLayout } from '../../store/useAppStore'
import { createColumns } from '../table/columns'
import { Dialog, DialogFooter, dialogCancelClass, dialogPrimaryClass } from '../common/Dialog'
import { TABLE_ACTIONS_COLUMN_ID, getVisibleStickyColumns } from '../../types/app'
import { Columns3, X } from 'lucide-react'

const actionBtnClass = 'px-2.5 py-1 text-xs bg-surface-2 border border-border rounded text-text-secondary hover:text-text-primary hover:border-border-light transition-colors'

interface ColumnOption {
  id: string
  label: string
  alwaysVisible?: boolean
}

/**
 * Builds the list of column options for the visibility/sticky dialog.
 * Includes the action column (always visible) and all data columns.
 * @returns Array of column option objects with id, label, and alwaysVisible flag
 */
function getColumnOptions(): ColumnOption[] {
  const actionColumn = {
    id: TABLE_ACTIONS_COLUMN_ID,
    label: 'Edit/Delete',
    alwaysVisible: true,
  }
  const dataColumns = createColumns(0).flatMap(col => {
    const id = (col as { accessorKey?: string }).accessorKey || ''
    if (!id) return []
    return [{
      id,
      label: typeof col.header === 'string' ? col.header : id,
    }]
  })
  return [actionColumn, ...dataColumns]
}

/**
 * Creates a visibility map where all non-always-visible columns are shown.
 * @param columns - Array of column options
 * @returns Visibility record with all toggleable columns set to true
 */
function getShowAllVisibility(columns: ColumnOption[]): Record<string, boolean> {
  return Object.fromEntries(
    columns
      .filter(column => !column.alwaysVisible)
      .map(column => [column.id, true]),
  )
}

/**
 * Column visibility and sticky column management control.
 * Opens a dialog where users can toggle column visibility and pin columns.
 * Provides live preview of layout changes in the data table.
 */
export function ColumnVisibility() {
  const [open, setOpen] = useState(false)
  const columns = useMemo(() => getColumnOptions(), [])
  const savedVisibility = useAppStore(s => s.settings.columnVisibility)
  const savedStickyColumns = useAppStore(s => s.settings.stickyColumns)
  const setTableLayoutPreview = useAppStore(s => s.setTableLayoutPreview)
  const commitColumnLayout = useAppStore(s => s.commitColumnLayout)
  const [draftVisibility, setDraftVisibility] = useState<Record<string, boolean>>({})
  const [draftStickyColumns, setDraftStickyColumns] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setTableLayoutPreview({
      columnVisibility: draftVisibility,
      stickyColumns: getVisibleStickyColumns(draftStickyColumns, draftVisibility),
    })
  }, [draftStickyColumns, draftVisibility, open, setTableLayoutPreview])

  function openDialog(): void {
    setDraftVisibility({ ...savedVisibility })
    setDraftStickyColumns(getVisibleStickyColumns(savedStickyColumns ?? [], savedVisibility))
    setOpen(true)
  }

  function cancelDialog(): void {
    setOpen(false)
    setTableLayoutPreview(null)
  }

  function saveDialog(): void {
    commitColumnLayout({
      columnVisibility: draftVisibility,
      stickyColumns: getVisibleStickyColumns(draftStickyColumns, draftVisibility),
    })
    setOpen(false)
  }

  function setDraftColumnVisibility(column: string, visible: boolean): void {
    setDraftVisibility(current => ({ ...current, [column]: visible }))
    if (!visible) {
      setDraftStickyColumns(current => current.filter(stickyColumn => stickyColumn !== column))
    }
  }

  function setDraftColumnSticky(column: string, sticky: boolean): void {
    setDraftStickyColumns(current => {
      if (sticky && !current.includes(column)) return [...current, column]
      if (!sticky) return current.filter(stickyColumn => stickyColumn !== column)
      return current
    })
  }

  function showAllColumns(): void {
    setDraftVisibility(getShowAllVisibility(columns))
  }

  function unstickAllColumns(): void {
    setDraftStickyColumns([])
  }

  function resetDraftLayout(): void {
    setDraftVisibility({ ...defaultColumnLayout.columnVisibility })
    setDraftStickyColumns([...defaultColumnLayout.stickyColumns])
  }

  return (
    <>
      <button
        onClick={openDialog}
        className="flex items-center gap-1.5 bg-surface-2 border border-border rounded px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
      >
        <Columns3 size={13} />
        Columns
      </button>

      <Dialog open={open} onClose={cancelDialog} title="Columns" maxWidth="max-w-2xl">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs text-text-secondary">
            Choose which columns are visible and which visible columns stay fixed while scrolling.
          </p>
          <button
            onClick={cancelDialog}
            className="shrink-0 text-text-muted hover:text-text-primary transition-colors"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-3">
          <button onClick={showAllColumns} className={actionBtnClass}>Show all</button>
          <button onClick={unstickAllColumns} className={actionBtnClass}>Unstick all</button>
          <button onClick={resetDraftLayout} className={actionBtnClass}>Reset layout</button>
        </div>

        <div className="max-h-[420px] overflow-y-auto border border-border rounded bg-surface-2">
          <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] gap-2 px-3 py-2 border-b border-border text-xs font-medium uppercase tracking-wider text-text-secondary sticky top-0 bg-surface-2">
            <span>Column</span>
            <span className="text-center">Show</span>
            <span className="text-center">Sticky</span>
          </div>
          {columns.map(column => {
            const isVisible = column.alwaysVisible || draftVisibility[column.id] !== false
            const isSticky = isVisible && draftStickyColumns.includes(column.id)
            return (
              <div
                key={column.id}
                className="grid grid-cols-[minmax(0,1fr)_72px_72px] items-center gap-2 px-3 py-2 border-b border-border/50 last:border-b-0 hover:bg-surface-3"
              >
                <span className="text-sm text-text-primary truncate">{column.label}</span>
                <label className="flex justify-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isVisible}
                    disabled={column.alwaysVisible}
                    onChange={e => setDraftColumnVisibility(column.id, e.target.checked)}
                    className="h-3.5 w-3.5 accent-accent disabled:opacity-40"
                  />
                </label>
                <label className={`flex justify-center ${isVisible ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                  <input
                    type="checkbox"
                    checked={isSticky}
                    disabled={!isVisible}
                    onChange={e => setDraftColumnSticky(column.id, e.target.checked)}
                    className="h-3.5 w-3.5 accent-accent disabled:opacity-40"
                  />
                </label>
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <button
            onClick={cancelDialog}
            className={dialogCancelClass}
          >
            Cancel
          </button>
          <button
            onClick={saveDialog}
            className={dialogPrimaryClass}
          >
            Save
          </button>
        </DialogFooter>
      </Dialog>
    </>
  )
}
