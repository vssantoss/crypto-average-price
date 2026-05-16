import { useEffect, useMemo, useState } from 'react'
import { useAppStore, defaultColumnLayout } from '../../store/useAppStore'
import { createColumns } from '../table/columns'
import { Dialog } from '../common/Dialog'
import { TABLE_ACTIONS_COLUMN_ID } from '../../types/app'
import { Columns3, X } from 'lucide-react'

interface ColumnOption {
  id: string
  label: string
  alwaysVisible?: boolean
}

/**
 * Builds the selectable column list shown in the layout dialog.
 * @returns Column ids and labels in datatable order
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
 * Removes sticky columns that are hidden in the provided visibility map.
 * @param stickyColumns - Column ids requested as sticky
 * @param columnVisibility - Visibility map where false means hidden
 * @returns Sticky column ids that are still visible
 */
function getVisibleStickyColumns(
  stickyColumns: string[],
  columnVisibility: Record<string, boolean>,
): string[] {
  return stickyColumns.filter(column => columnVisibility[column] !== false)
}

/**
 * Builds a visibility map that explicitly shows every known column.
 * @param columns - Columns available in the layout dialog
 * @returns Visibility map with every column set to visible
 */
function getShowAllVisibility(columns: ColumnOption[]): Record<string, boolean> {
  return Object.fromEntries(
    columns
      .filter(column => !column.alwaysVisible)
      .map(column => [column.id, true]),
  )
}

/**
 * Panel button and dialog for changing datatable visibility and sticky columns.
 * @returns Column layout button and modal dialog
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

  /**
   * Opens the dialog and initializes draft layout from saved settings.
   * @returns Nothing
   */
  function openDialog(): void {
    setDraftVisibility({ ...savedVisibility })
    setDraftStickyColumns(getVisibleStickyColumns(savedStickyColumns ?? [], savedVisibility))
    setOpen(true)
  }

  /**
   * Closes the dialog without saving draft layout changes.
   * @returns Nothing
   */
  function cancelDialog(): void {
    setOpen(false)
    setTableLayoutPreview(null)
  }

  /**
   * Saves the current draft layout and closes the dialog.
   * @returns Nothing
   */
  function saveDialog(): void {
    commitColumnLayout({
      columnVisibility: draftVisibility,
      stickyColumns: getVisibleStickyColumns(draftStickyColumns, draftVisibility),
    })
    setOpen(false)
  }

  /**
   * Updates one column's visibility and removes stickiness when hiding it.
   * @param column - Column id being changed
   * @param visible - Whether the column should be visible
   * @returns Nothing
   */
  function setDraftColumnVisibility(column: string, visible: boolean): void {
    setDraftVisibility(current => ({ ...current, [column]: visible }))
    if (!visible) {
      setDraftStickyColumns(current => current.filter(stickyColumn => stickyColumn !== column))
    }
  }

  /**
   * Updates whether one visible column should stick to the left while scrolling.
   * @param column - Column id being changed
   * @param sticky - Whether the column should be sticky
   * @returns Nothing
   */
  function setDraftColumnSticky(column: string, sticky: boolean): void {
    setDraftStickyColumns(current => {
      if (sticky && !current.includes(column)) return [...current, column]
      if (!sticky) return current.filter(stickyColumn => stickyColumn !== column)
      return current
    })
  }

  /**
   * Shows all known columns in the draft layout.
   * @returns Nothing
   */
  function showAllColumns(): void {
    setDraftVisibility(getShowAllVisibility(columns))
  }

  /**
   * Clears every sticky column in the draft layout.
   * @returns Nothing
   */
  function unstickAllColumns(): void {
    setDraftStickyColumns([])
  }

  /**
   * Restores the draft layout to the app's default column layout.
   * @returns Nothing
   */
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
          <button
            onClick={showAllColumns}
            className="px-2.5 py-1 text-xs bg-surface-2 border border-border rounded text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
          >
            Show all
          </button>
          <button
            onClick={unstickAllColumns}
            className="px-2.5 py-1 text-xs bg-surface-2 border border-border rounded text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
          >
            Unstick all
          </button>
          <button
            onClick={resetDraftLayout}
            className="px-2.5 py-1 text-xs bg-surface-2 border border-border rounded text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
          >
            Reset layout
          </button>
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

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={cancelDialog}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={saveDialog}
            className="px-3 py-1.5 text-xs bg-accent/20 border border-accent/40 rounded text-accent hover:bg-accent/30 transition-colors"
          >
            Save
          </button>
        </div>
      </Dialog>
    </>
  )
}
