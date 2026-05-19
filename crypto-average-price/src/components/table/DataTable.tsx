import { useState, useMemo, useEffect, type CSSProperties } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getFacetedUniqueValues,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
  type ColumnPinningState,
  type FilterFn,
  type Column,
} from '@tanstack/react-table'
import type { ProcessedRow } from '../../types/transaction'
import { JournalType } from '../../types/transaction'
import { useAppStore } from '../../store/useAppStore'
import { TABLE_ACTIONS_COLUMN_ID } from '../../types/app'
import { createColumns } from './columns'
import { ColumnFilter } from './ColumnFilter'
import { EditableCell } from './EditableCell'
import { AddRowDialog } from '../dialogs/AddRowDialog'
import { Dialog, DialogFooter, dialogCancelClass, dialogDangerClass } from '../common/Dialog'
import type { CryptoComRow } from '../../types/transaction'
import { AlertTriangle, ArrowUp, ArrowDown, Pencil, Trash2 } from 'lucide-react'

const caseInsensitiveFilter: FilterFn<ProcessedRow> = (row, columnId, filterValue) => {
  const value = String(row.getValue(columnId) ?? '').toLowerCase()
  return value.includes(String(filterValue).toLowerCase())
}
import { formatNumber } from '../../utils/number'

const ACTION_COLUMN_WIDTH = 40
const CALCULATED_COLUMN_IDS = new Set([
  'tradeFeeQuantity',
  'netTransactionQuantity',
  'runningBalance',
  'cambioBC',
  'brlRunningBalance',
  'brlTransactionCost',
  'precoMedioCompra',
  'totalLucroPrejuizo',
])

/**
 * Props for the DataTable component.
 */
interface DataTableProps {
  data: ProcessedRow[]
}

interface TableColumnMeta {
  editable?: string
  numeric?: boolean
}

interface StickyColumnRenderState {
  style: CSSProperties
}

type RowType = 'buy' | 'sell' | 'neutral'

/**
 * Determines the visual category of a row for styling.
 * @param row - Processed row to classify
 * @returns 'buy' for acquisitions/deposits, 'sell' for dispositions/withdrawals, 'neutral' otherwise
 */
function getRowType(row: ProcessedRow): RowType {
  if (
    row.side === 'BUY' ||
    row.journalType === JournalType.OFFCHAIN_DEPOSIT ||
    row.journalType === JournalType.ONCHAIN_DEPOSIT
  ) return 'buy'
  if (
    row.side === 'SELL' ||
    row.journalType === JournalType.OFFCHAIN_WITHDRAWAL ||
    row.journalType === JournalType.ONCHAIN_WITHDRAWAL
  ) return 'sell'
  return 'neutral'
}

/**
 * Returns CSS classes for a table row based on its buy/sell/neutral type.
 * @param row - Processed row to style
 * @returns Tailwind class string with background and left border color
 */
function getRowClass(row: ProcessedRow): string {
  const type = getRowType(row)
  if (type === 'buy') return 'bg-buy-bg border-l-2 border-l-buy-border'
  if (type === 'sell') return 'bg-sell-bg border-l-2 border-l-sell-border'
  return 'border-l-2 border-l-transparent'
}

/**
 * Checks whether a column should use right-aligned numeric formatting.
 * @param meta - Column metadata from the column definition
 * @returns True if the column is marked as numeric
 */
function isNumericColumn(meta: TableColumnMeta | undefined): boolean {
  return meta?.numeric === true
}

/**
 * Returns CSS classes for a table body cell.
 * @param numeric - Whether the cell contains numeric data (right-aligned)
 * @returns Tailwind class string for the cell
 */
function getBodyCellClass(numeric: boolean): string {
  return `px-3 py-1 border-b border-border/50 whitespace-nowrap ${numeric ? 'text-right tabular-nums' : ''}`
}

/**
 * Returns CSS classes for the content wrapper inside a table cell.
 * @param numeric - Whether the cell contains numeric data
 * @returns Tailwind class string for the cell content div
 */
function getCellContentClass(numeric: boolean): string {
  return `flex items-center gap-1 ${numeric ? 'justify-end tabular-nums' : ''}`
}

/**
 * Checks whether a calculated table cell should be blank for a processed row.
 * @param row - Processed row being rendered
 * @param columnId - Table column id being rendered
 * @returns True when the cell should not show calculated data
 */
function shouldBlankCalculatedCell(row: ProcessedRow, columnId: string): boolean {
  return row.suppressCalculatedFields && CALCULATED_COLUMN_IDS.has(columnId)
}

// Opaque backgrounds for sticky cells — must match the row tint so content behind doesn't bleed through.
function getStickyBodyBackground(row: ProcessedRow): string {
  const type = getRowType(row)
  if (type === 'buy') return 'color-mix(in srgb, var(--color-surface-0) 82%, var(--color-success))'
  if (type === 'sell') return 'color-mix(in srgb, var(--color-surface-0) 82%, var(--color-danger))'
  return 'var(--color-surface-0)'
}

/**
 * Computes the inline style for a sticky (pinned) data column.
 * @param column - TanStack Table column instance
 * @param backgroundColor - Opaque background color for the sticky cell
 * @param zIndex - CSS z-index for stacking order
 * @param leftOffset - Additional left offset (e.g., when action column is also sticky)
 * @returns Object with the computed CSSProperties for the cell
 */
function getStickyColumnRenderState(
  column: Column<ProcessedRow, unknown>,
  backgroundColor: string,
  zIndex: number,
  leftOffset = 0,
): StickyColumnRenderState {
  const pinned = column.getIsPinned()
  if (pinned !== 'left') return { style: {} }

  return {
    style: {
      position: 'sticky',
      left: column.getStart('left') + leftOffset,
      zIndex,
      backgroundColor,
    },
  }
}

/**
 * Checks whether the action (edit/delete) column is in the sticky list.
 * @param stickyColumns - Array of pinned column IDs
 * @returns True if the action column should be sticky
 */
function isActionColumnSticky(stickyColumns: string[]): boolean {
  return stickyColumns.includes(TABLE_ACTIONS_COLUMN_ID)
}

/**
 * Computes the inline style for the sticky action column.
 * @param sticky - Whether the action column is pinned
 * @param backgroundColor - Opaque background color for the sticky cell
 * @param zIndex - CSS z-index for stacking order
 * @returns Object with the computed CSSProperties for the action cell
 */
function getActionColumnRenderState(
  sticky: boolean,
  backgroundColor: string,
  zIndex: number,
): StickyColumnRenderState {
  if (!sticky) return { style: {} }

  return {
    style: {
      position: 'sticky',
      left: 0,
      zIndex,
      backgroundColor,
    },
  }
}

/**
 * Merges base cell styles with sticky positioning styles.
 * @param baseStyle - Base inline styles (e.g., width)
 * @param stickyStyle - Sticky positioning styles (position, left, zIndex, background)
 * @returns Combined CSSProperties object
 */
function mergeCellStyle(baseStyle: CSSProperties, stickyStyle: CSSProperties): CSSProperties {
  return { ...baseStyle, ...stickyStyle }
}

/**
 * Main datatable component.
 * Renders a TanStack Table with sorting, filtering, column visibility,
 * and inline-editable cells for Info, BRL cost, and avg price seed.
 * @param props - Component props with processed row data
 * @returns The datatable element
 */
export function DataTable({ data }: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFiltersRaw] = useState<ColumnFiltersState>([])
  const [editRow, setEditRow] = useState<CryptoComRow | null>(null)
  const [deleteOrder, setDeleteOrder] = useState<number | null>(null)
  const tableLayoutPreview = useAppStore(s => s.tableLayoutPreview)
  const savedColumnVisibility = useAppStore(s => s.settings.columnVisibility)
  const savedStickyColumns = useAppStore(s => s.settings.stickyColumns)
  const columnVisibility = (tableLayoutPreview?.columnVisibility ?? savedColumnVisibility) as VisibilityState
  const stickyColumns = useMemo(
    () => tableLayoutPreview?.stickyColumns ?? savedStickyColumns ?? [],
    [savedStickyColumns, tableLayoutPreview?.stickyColumns],
  )
  const actionColumnSticky = isActionColumnSticky(stickyColumns)
  const dataStickyColumns = useMemo(
    () => stickyColumns.filter(column => column !== TABLE_ACTIONS_COLUMN_ID),
    [stickyColumns],
  )
  const stickyDataLeftOffset = actionColumnSticky ? ACTION_COLUMN_WIDTH : 0
  const setActiveTableFilters = useAppStore(s => s.setActiveTableFilters)
  const setInfoEdit = useAppStore(s => s.setInfoEdit)
  const setAvgPriceSeed = useAppStore(s => s.setAvgPriceSeed)
  const setUserBrlCost = useAppStore(s => s.setUserBrlCost)
  const setBalanceOverride = useAppStore(s => s.setBalanceOverride)
  const deleteRow = useAppStore(s => s.deleteRow)
  const rawTransactions = useAppStore(s => s.rawTransactions)
  const timezoneOffset = useAppStore(s => s.settings.timezoneOffset)
  const roundBalance = useAppStore(s => s.settings.roundBalance)
  const cols = useMemo(() => createColumns(timezoneOffset, roundBalance), [timezoneOffset, roundBalance])
  const rawByOrder = useMemo(() => new Map(rawTransactions.map(row => [row.order, row])), [rawTransactions])
  const columnPinning = useMemo<ColumnPinningState>(() => ({
    left: dataStickyColumns,
    right: [],
  }), [dataStickyColumns])

  const headerMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const col of cols) {
      const id = (col as { accessorKey?: string }).accessorKey
      const header = col.header
      if (id && typeof header === 'string') map[id] = header
    }
    return map
  }, [cols])

  const activeFilters = useMemo(() => {
    return columnFilters
      .map(f => ({ column: headerMap[f.id] || f.id, value: String(f.value) }))
      .filter(f => f.value)
  }, [columnFilters, headerMap])

  useEffect(() => {
    setActiveTableFilters(activeFilters)
  }, [activeFilters, setActiveTableFilters])

  const setColumnFilters = (updater: ColumnFiltersState | ((old: ColumnFiltersState) => ColumnFiltersState)) => {
    setColumnFiltersRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      return next
    })
  }

  // TanStack Table returns non-memoizable functions; the table instance is still the intended API boundary here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns: cols,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      columnPinning,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn: caseInsensitiveFilter,
    filterFns: { caseInsensitive: caseInsensitiveFilter },
    defaultColumn: { filterFn: caseInsensitiveFilter },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })
  const actionHeaderSticky = getActionColumnRenderState(
    actionColumnSticky,
    'var(--color-surface-2)',
    31,
  )

  return (
    <div className="h-full overflow-auto">
      <AddRowDialog open={!!editRow} onClose={() => setEditRow(null)} editRow={editRow} />
      {deleteOrder !== null && (
        <Dialog open={deleteOrder !== null} onClose={() => setDeleteOrder(null)} title="Delete Transaction">
          <p className="text-xs text-text-secondary mb-4">
            Delete row #{deleteOrder}?
          </p>
          <DialogFooter>
            <button
              onClick={() => setDeleteOrder(null)}
              className={dialogCancelClass}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                deleteRow(deleteOrder)
                setDeleteOrder(null)
              }}
              className={dialogDangerClass}
            >
              Delete
            </button>
          </DialogFooter>
        </Dialog>
      )}
      <table className="border-separate border-spacing-0 font-mono text-xs" style={{ minWidth: '100%' }}>
        <thead className="bg-surface-2 sticky top-0 z-40">
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              <th
                className="w-[40px] min-w-[40px] px-0 py-2 border-b border-border"
                style={actionHeaderSticky.style}
              />
              {headerGroup.headers.map(header => {
                const meta = header.column.columnDef.meta as TableColumnMeta | undefined
                const numeric = isNumericColumn(meta)
                const sticky = getStickyColumnRenderState(header.column, 'var(--color-surface-2)', 30, stickyDataLeftOffset)
                return (
                  <th
                    key={header.id}
                    className={`${numeric ? 'text-right' : 'text-left'} text-text-secondary font-medium px-3 py-2 border-b border-border whitespace-nowrap`}
                    style={mergeCellStyle({ width: header.getSize(), minWidth: header.getSize() }, sticky.style)}
                  >
                    {header.isPlaceholder ? null : (
                      <div className={`flex flex-col gap-1 ${numeric ? 'items-end' : ''}`}>
                        <div
                          className={`flex items-center gap-1 select-none ${numeric ? 'justify-end' : ''} ${
                            header.column.getCanSort() ? 'cursor-pointer hover:text-text-primary' : ''
                          }`}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: <ArrowUp size={14} className="text-accent" />,
                            desc: <ArrowDown size={14} className="text-accent" />,
                          }[header.column.getIsSorted() as string] ?? null}
                        </div>
                        {header.column.getCanFilter() && (
                          <ColumnFilter column={header.column} />
                        )}
                      </div>
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => {
            const original = row.original
            const raw = rawByOrder.get(original.order)
            const stickyBg = getStickyBodyBackground(original)
            const actionSticky = getActionColumnRenderState(
              actionColumnSticky,
              stickyBg,
              21,
            )
            return (
              <tr
                key={row.id}
                className={`${getRowClass(original)} hover:bg-surface-3/50 transition-colors group/row`}
              >
                <td
                  className="w-[40px] min-w-[40px] px-0 py-1 border-b border-border/50 whitespace-nowrap"
                  style={actionSticky.style}
                >
                  <div className="flex w-full items-center justify-center gap-1 opacity-0 group-hover/row:opacity-100">
                    <button
                      onClick={() => {
                        if (raw) setEditRow(raw)
                      }}
                      className="p-0 text-text-muted hover:text-accent transition-colors"
                      title="Edit row"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => setDeleteOrder(original.order)}
                      className="p-0 text-text-muted hover:text-danger transition-colors"
                      title="Delete row"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
                {row.getVisibleCells().map(cell => {
                  const meta = cell.column.columnDef.meta as TableColumnMeta | undefined
                  const numeric = isNumericColumn(meta)
                  const sticky = getStickyColumnRenderState(
                    cell.column,
                    stickyBg,
                    20,
                    stickyDataLeftOffset,
                  )

                  if (shouldBlankCalculatedCell(original, cell.column.id)) {
                    return (
                      <td
                        key={cell.id}
                        className={getBodyCellClass(numeric)}
                        style={sticky.style}
                      />
                    )
                  }

                  // Render editable cells
                  if (meta?.editable === 'info') {
                    return (
                      <td
                        key={cell.id}
                        className="px-2 py-1 border-b border-border/50"
                        style={sticky.style}
                      >
                        <EditableCell
                          value={original.info}
                          onSave={val => setInfoEdit(original.order, val)}
                          placeholder="Add note..."
                        />
                      </td>
                    )
                  }

                  if (meta?.editable === 'avgPrice') {
                    const calculatedValue = original.precoMedioCompra !== null ? original.precoMedioCompra.toFixed(roundBalance ? 2 : 4) : ''
                    const manualValue = raw?.avgPriceSeed !== undefined ? raw.avgPriceSeed.toString() : ''

                    return (
                      <td
                        key={cell.id}
                        className="px-2 py-1 border-b border-border/50 text-right tabular-nums"
                        style={sticky.style}
                      >
                        <EditableCell
                          value={calculatedValue}
                          editValue={manualValue}
                          editPlaceholder={calculatedValue}
                          onSave={val => {
                            const num = parseFloat(val)
                            setAvgPriceSeed(original.order, isNaN(num) ? null : num)
                          }}
                          placeholder="Set avg price..."
                          className="justify-end text-right"
                          showIcon={false}
                        />
                      </td>
                    )
                  }

                  // Editable running balance
                  if (cell.column.id === 'runningBalance') {
                    const calculatedValue = formatNumber(original.runningBalance, roundBalance ? 2 : 8)
                    const manualValue = raw?.balanceOverride !== undefined ? raw.balanceOverride.toString() : ''

                    return (
                      <td
                        key={cell.id}
                        className={`px-2 py-1 border-b border-border/50 text-right tabular-nums ${original.hasBalanceOverride ? 'bg-accent/10' : ''}`}
                        style={sticky.style}
                      >
                        <EditableCell
                          value={calculatedValue}
                          editValue={manualValue}
                          editPlaceholder={calculatedValue}
                          onSave={val => {
                            const num = parseFloat(val)
                            setBalanceOverride(original.order, isNaN(num) ? null : num)
                          }}
                          placeholder=""
                          className="justify-end text-right"
                          showIcon={false}
                        />
                      </td>
                    )
                  }

                  // Special: editable BRL cost for deposits
                  if (cell.column.id === 'brlTransactionCost' && original.isEditable.brlCost) {
                    const calculatedValue = original.brlTransactionCost !== null ? original.brlTransactionCost.toFixed(roundBalance ? 2 : 4) : ''
                    const manualValue = raw?.userBrlCost !== undefined ? raw.userBrlCost.toString() : ''

                    return (
                      <td
                        key={cell.id}
                        className="px-2 py-1 border-b border-border/50 text-right tabular-nums"
                        style={sticky.style}
                      >
                        <EditableCell
                          value={calculatedValue}
                          editValue={manualValue}
                          editPlaceholder={calculatedValue}
                          onSave={val => {
                            const num = parseFloat(val)
                            setUserBrlCost(original.order, isNaN(num) ? null : num)
                          }}
                          placeholder="Enter BRL amount..."
                          className="justify-end text-right"
                          showIcon={false}
                        />
                      </td>
                    )
                  }

                  // Profit/loss with color
                  if (cell.column.id === 'totalLucroPrejuizo') {
                    const val = original.totalLucroPrejuizo
                    return (
                      <td
                        key={cell.id}
                        className={getBodyCellClass(true)}
                        style={sticky.style}
                      >
                        {val !== null && (
                          <span className={`inline-block w-full ${val >= 0 ? 'text-success' : 'text-danger'}`}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </span>
                        )}
                      </td>
                    )
                  }

                  return (
                    <td
                      key={cell.id}
                      className={getBodyCellClass(numeric)}
                      style={sticky.style}
                    >
                      <div className={getCellContentClass(numeric)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        {cell.column.id === 'cambioBC' && original.hasPtaxWarning && (
                          <span title="No PTAX rate found for this date" className="inline-flex shrink-0">
                            <AlertTriangle size={14} className="text-warning" />
                          </span>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
