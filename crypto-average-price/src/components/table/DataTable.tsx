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
import { Dialog } from '../common/Dialog'
import type { CryptoComRow } from '../../types/transaction'
import { AlertTriangle, ArrowUp, ArrowDown, Pencil, Trash2 } from 'lucide-react'

const caseInsensitiveFilter: FilterFn<ProcessedRow> = (row, columnId, filterValue) => {
  const value = String(row.getValue(columnId) ?? '').toLowerCase()
  return value.includes(String(filterValue).toLowerCase())
}
import { formatNumber } from '../../utils/number'

const ACTION_COLUMN_WIDTH = 40

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

/**
 * Returns a CSS class for row background based on the transaction type.
 * Buy/deposit rows get a green tint, sell/withdrawal get red.
 * @param row - The processed row
 * @returns Tailwind CSS class string
 */
function getRowClass(row: ProcessedRow): string {
  if (
    row.side === 'BUY' ||
    row.journalType === JournalType.OFFCHAIN_DEPOSIT ||
    row.journalType === JournalType.ONCHAIN_DEPOSIT
  ) {
    return 'bg-buy-bg border-l-2 border-l-buy-border'
  }
  if (
    row.side === 'SELL' ||
    row.journalType === JournalType.OFFCHAIN_WITHDRAWAL ||
    row.journalType === JournalType.ONCHAIN_WITHDRAWAL
  ) {
    return 'bg-sell-bg border-l-2 border-l-sell-border'
  }
  return 'border-l-2 border-l-transparent'
}

/**
 * Checks whether a table column contains numeric values.
 * @param meta - Column metadata from TanStack Table
 * @returns True when cells in this column should be right-aligned
 */
function isNumericColumn(meta: TableColumnMeta | undefined): boolean {
  return meta?.numeric === true
}

/**
 * Builds the base class for datatable body cells.
 * @param numeric - Whether the cell contains a numeric value
 * @returns CSS class string for a body cell
 */
function getBodyCellClass(numeric: boolean): string {
  return `px-3 py-1 border-b border-border/50 whitespace-nowrap ${numeric ? 'text-right tabular-nums' : ''}`
}

/**
 * Builds flex alignment classes for rendered cell content.
 * @param numeric - Whether the cell contains a numeric value
 * @returns CSS class string for cell content wrapper
 */
function getCellContentClass(numeric: boolean): string {
  return `flex items-center gap-1 ${numeric ? 'justify-end tabular-nums' : ''}`
}

/**
 * Gets an opaque background color for sticky body cells.
 * @param row - The processed row rendered by the sticky cell
 * @returns CSS background color preserving the row's transaction tint
 */
function getStickyBodyBackground(row: ProcessedRow): string {
  if (
    row.side === 'BUY' ||
    row.journalType === JournalType.OFFCHAIN_DEPOSIT ||
    row.journalType === JournalType.ONCHAIN_DEPOSIT
  ) {
    return 'color-mix(in srgb, var(--color-surface-0) 82%, var(--color-success))'
  }
  if (
    row.side === 'SELL' ||
    row.journalType === JournalType.OFFCHAIN_WITHDRAWAL ||
    row.journalType === JournalType.ONCHAIN_WITHDRAWAL
  ) {
    return 'color-mix(in srgb, var(--color-surface-0) 82%, var(--color-danger))'
  }
  return 'var(--color-surface-0)'
}

/**
 * Builds sticky positioning props for a pinned table column.
 * @param column - TanStack table column
 * @param backgroundColor - Opaque background color for sticky overlap
 * @param zIndex - Layer order for the sticky cell
 * @param leftOffset - Extra left offset reserved before TanStack columns
 * @returns Extra class and style props for the rendered cell
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
 * Checks whether the manual row action gutter should stick while scrolling.
 * @param stickyColumns - Active sticky column ids from the saved or preview layout
 * @returns True when the edit/delete gutter should be sticky
 */
function isActionColumnSticky(stickyColumns: string[]): boolean {
  return stickyColumns.includes(TABLE_ACTIONS_COLUMN_ID)
}

/**
 * Builds sticky positioning props for the manual edit/delete action gutter.
 * @param sticky - Whether the action gutter should be sticky
 * @param backgroundColor - Opaque background color for sticky overlap
 * @param zIndex - Layer order for the sticky cell
 * @returns Extra class and style props for the rendered action cell
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
 * Combines existing and sticky table cell styles.
 * @param baseStyle - Existing table cell dimensions
 * @param stickyStyle - Sticky column style overrides
 * @returns A merged style object for the rendered cell
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
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setDeleteOrder(null)}
              className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                deleteRow(deleteOrder)
                setDeleteOrder(null)
              }}
              className="px-3 py-1.5 text-xs bg-danger/20 border border-danger/40 rounded text-danger hover:bg-danger/30 transition-colors"
            >
              Delete
            </button>
          </div>
        </Dialog>
      )}
      <table className="border-separate border-spacing-0 font-mono text-xs" style={{ minWidth: '100%' }}>
        <thead className="bg-surface-2 sticky top-0 z-10">
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
            const actionSticky = getActionColumnRenderState(
              actionColumnSticky,
              getStickyBodyBackground(original),
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
                        const raw = rawByOrder.get(original.order)
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
                    getStickyBodyBackground(original),
                    20,
                    stickyDataLeftOffset,
                  )

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
                    const raw = rawByOrder.get(original.order)
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
                    const raw = rawByOrder.get(original.order)
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
                    const raw = rawByOrder.get(original.order)
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
      {data.length === 0 && (
        <div className="text-center py-16 font-mono text-xs text-text-muted">
          Import a Crypto.com transaction report to get started.
        </div>
      )}
    </div>
  )
}
