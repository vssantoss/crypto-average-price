import { useState, useRef, useEffect, useMemo } from 'react'
import type { Column } from '@tanstack/react-table'

interface ColumnFilterProps<T> {
  column: Column<T, unknown>
}

export function ColumnFilter<T>({ column }: ColumnFilterProps<T>) {
  const filterValue = (column.getFilterValue() as string) ?? ''
  const meta = column.columnDef.meta as { filterType?: string } | undefined
  const isCombo = meta?.filterType === 'combo'

  if (!isCombo) {
    return <TextFilter column={column} filterValue={filterValue} />
  }

  return <ComboFilter column={column} filterValue={filterValue} />
}

/**
 * Renders a debounced text filter for free-form table filtering.
 * @param props - Table column and current committed filter value
 * @returns Text filter input element
 */
function TextFilter<T>({ column, filterValue }: { column: Column<T, unknown>; filterValue: string }) {
  const [inputValue, setInputValue] = useState(filterValue)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      column.setFilterValue(inputValue || undefined)
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [column, inputValue])

  return (
    <input
      type="text"
      value={inputValue}
      onChange={e => setInputValue(e.target.value)}
      placeholder="Filter..."
      className="w-full bg-surface-2 border border-border rounded px-1.5 py-0.5 text-xs text-text-secondary outline-none focus:border-accent/50 placeholder:text-text-muted"
    />
  )
}

/**
 * Renders a debounced combo filter with suggestions from faceted table values.
 * @param props - Table column and current committed filter value
 * @returns Combo filter element
 */
function ComboFilter<T>({ column, filterValue }: { column: Column<T, unknown>; filterValue: string }) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState(filterValue)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const uniqueValues = useMemo(() => {
    const vals = new Set<string>()
    const faceted = column.getFacetedUniqueValues()
    for (const [key] of faceted) {
      const s = String(key ?? '').trim()
      if (s) vals.add(s)
    }
    return Array.from(vals).sort()
  }, [column])

  const filtered = useMemo(() => {
    if (!inputValue) return uniqueValues
    const lower = inputValue.toLowerCase()
    return uniqueValues.filter(v => v.toLowerCase().includes(lower))
  }, [uniqueValues, inputValue])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      column.setFilterValue(inputValue || undefined)
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [column, inputValue])

  /**
   * Selects a suggested filter value and closes the suggestion list.
   * @param val - Selected filter value
   */
  function select(val: string) {
    column.setFilterValue(val || undefined)
    setInputValue(val)
    setOpen(false)
  }

  /**
   * Updates the local filter draft and opens suggestions while typing.
   * @param val - Current typed filter text
   */
  function handleInput(val: string) {
    setInputValue(val)
    if (!open) setOpen(true)
  }

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        value={inputValue}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Filter..."
        className="w-full bg-surface-2 border border-border rounded px-1.5 py-0.5 text-xs text-text-secondary outline-none focus:border-accent/50 placeholder:text-text-muted"
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 mt-0.5 bg-surface-2 border border-border rounded shadow-lg z-30 max-h-[200px] overflow-y-auto flex flex-col min-w-full w-max">
          {filterValue && (
            <button
              onClick={() => select('')}
              className="w-full text-left px-2 py-1 text-xs text-text-muted hover:bg-surface-3 transition-colors"
            >
              Clear filter
            </button>
          )}
          {filtered.map(val => (
            <button
              key={val}
              onClick={() => select(val)}
              className={`w-full text-left px-2 py-1 text-xs hover:bg-surface-3 transition-colors ${
                val.toLowerCase() === filterValue.toLowerCase() ? 'text-accent' : 'text-text-primary'
              }`}
            >
              {val}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
