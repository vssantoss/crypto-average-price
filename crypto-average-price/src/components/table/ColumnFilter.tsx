import { useState, useRef, useEffect, useMemo } from 'react'
import type { Column } from '@tanstack/react-table'

interface ColumnFilterProps<T> {
  column: Column<T, unknown>
}

interface MultiSelectFilterValue {
  values?: string[]
  text?: string
}

type ColumnFilterValue = string | string[] | MultiSelectFilterValue

interface ColumnFilterMeta {
  filterType?: 'combo' | 'multiselect'
  formatFilterValue?: (value: string) => string
  getFilterOptionValue?: (value: string) => string
  textFilterPlaceholder?: string
}

/**
 * Renders the correct filter control for a table column.
 * @param props - Table column to filter
 * @returns Filter control element for the column metadata
 */
export function ColumnFilter<T>({ column }: ColumnFilterProps<T>) {
  const rawFilterValue = column.getFilterValue() as ColumnFilterValue | undefined
  const filterValue = typeof rawFilterValue === 'string' ? rawFilterValue : ''
  const meta = column.columnDef.meta as ColumnFilterMeta | undefined

  if (meta?.filterType === 'multiselect') {
    return <MultiSelectFilter column={column} filterValue={rawFilterValue} meta={meta} />
  }

  if (meta?.filterType !== 'combo') {
  return <TextFilter key={filterValue} column={column} filterValue={filterValue} />
  }

  return <ComboFilter key={filterValue} column={column} filterValue={filterValue} />
}

/**
 * Gets sorted non-empty faceted values for a column filter menu.
 * @param column - Table column with faceted unique values
 * @returns Sorted unique string values present in the column
 */
function getUniqueValues<T>(column: Column<T, unknown>): string[] {
  const vals = new Set<string>()
  const faceted = column.getFacetedUniqueValues()
  for (const [key] of faceted) {
    const s = String(key ?? '').trim()
    if (s) vals.add(s)
  }
  return Array.from(vals).sort()
}

/**
 * Checks whether a filter value contains multi-select state plus text.
 * @param value - Raw column filter value
 * @returns True when the value uses the multi-select object shape
 */
function isMultiSelectFilterValue(value: ColumnFilterValue | undefined): value is MultiSelectFilterValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Gets sorted filter option values, optionally transforming raw column values first.
 * @param column - Table column with faceted unique values
 * @param meta - Column filter metadata with optional value transformer
 * @returns Sorted unique filter option values
 */
function getUniqueFilterOptionValues<T>(column: Column<T, unknown>, meta: ColumnFilterMeta): string[] {
  const vals = new Set<string>()
  const faceted = column.getFacetedUniqueValues()
  for (const [key] of faceted) {
    const rawValue = String(key ?? '').trim()
    const optionValue = meta.getFilterOptionValue?.(rawValue) ?? rawValue
    const normalizedOption = optionValue.trim()
    if (normalizedOption) vals.add(normalizedOption)
  }
  return Array.from(vals).sort()
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

  const uniqueValues = getUniqueValues(column)

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

/**
 * Renders a checkbox menu for selecting multiple exact column values.
 * @param props - Table column, current filter value, and display metadata
 * @returns Multi-select checkbox filter menu
 */
function MultiSelectFilter<T>({
  column,
  filterValue,
  meta,
}: {
  column: Column<T, unknown>
  filterValue: ColumnFilterValue | undefined
  meta: ColumnFilterMeta
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const uniqueValues = getUniqueFilterOptionValues(column, meta)
  const selectedValues = isMultiSelectFilterValue(filterValue)
    ? filterValue.values?.map(String) ?? uniqueValues
    : Array.isArray(filterValue)
    ? filterValue.map(String)
    : uniqueValues
  const textValue = isMultiSelectFilterValue(filterValue) ? filterValue.text ?? '' : ''
  const hasTextFilter = meta.textFilterPlaceholder !== undefined

  useEffect(() => {
    if (!Array.isArray(filterValue) && !isMultiSelectFilterValue(filterValue)) return

    const availableValues = new Set(uniqueValues)
    const currentValues = Array.isArray(filterValue)
      ? filterValue.map(String)
      : filterValue.values?.map(String) ?? uniqueValues
    const nextSelected = currentValues.filter(value => availableValues.has(value))
    const hasStaleValues = nextSelected.length !== currentValues.length

    if (!hasStaleValues) return
    // When data changes remove every selected option, keep the table visible by falling back to All.
    if (currentValues.length > 0 && nextSelected.length === 0) {
      column.setFilterValue(undefined)
      return
    }
    commitFilter(nextSelected, textValue)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [column, filterValue, uniqueValues])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues])
  const allSelected = uniqueValues.length > 0 && selectedValues.length === uniqueValues.length
  const noneSelected = selectedValues.length === 0
  const baseLabel = allSelected
    ? 'All'
    : noneSelected
      ? 'None'
      : `${selectedValues.length} selected`
  const label = textValue.trim() ? `${baseLabel} + date` : baseLabel
  const filterButtonClass = noneSelected
    ? 'w-full bg-danger/20 border border-danger/60 rounded px-1.5 py-0.5 text-left text-xs text-danger outline-none hover:border-danger focus:border-danger'
    : 'w-full bg-surface-2 border border-border rounded px-1.5 py-0.5 text-left text-xs text-text-secondary outline-none hover:border-border-light focus:border-accent/50'

  /**
   * Commits selected filter values, clearing the filter when all values are selected.
   * @param nextSelected - Raw column values that should remain visible
   * @param nextText - Optional free-form text filter
   */
  function commitFilter(nextSelected: string[], nextText = textValue): void {
    const trimmedText = nextText.trim()
    const allSelectedNext = nextSelected.length === uniqueValues.length

    if (!hasTextFilter) {
      column.setFilterValue(allSelectedNext ? undefined : nextSelected)
      return
    }

    if (allSelectedNext && !trimmedText) {
      column.setFilterValue(undefined)
      return
    }

    column.setFilterValue({
      ...(allSelectedNext ? {} : { values: nextSelected }),
      ...(trimmedText ? { text: nextText } : {}),
    })
  }

  /**
   * Toggles a single filter value in the selected checkbox list.
   * @param value - Raw column value to toggle
   */
  function toggleValue(value: string): void {
    const nextSelected = selectedSet.has(value)
      ? selectedValues.filter(selected => selected !== value)
      : [...selectedValues, value]
    commitFilter(nextSelected)
  }

  /**
   * Updates the free-form text filter while keeping selected checkboxes.
   * @param nextText - Text typed by the user
   */
  function updateTextFilter(nextText: string): void {
    commitFilter(selectedValues, nextText)
  }

  /**
   * Selects every available filter value and clears free-form text.
   */
  function selectAll(): void {
    commitFilter(uniqueValues, '')
  }

  /**
   * Clears every checkbox and clears free-form text.
   */
  function selectNone(): void {
    commitFilter([], '')
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className={filterButtonClass}
      >
        {label}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-0.5 bg-surface-2 border border-border rounded shadow-lg z-30 max-h-[260px] overflow-y-auto flex flex-col min-w-full w-max">
          {hasTextFilter && (
            <div className="border-b border-border p-2">
              <input
                type="text"
                value={textValue}
                onChange={e => updateTextFilter(e.target.value)}
                placeholder={meta.textFilterPlaceholder}
                className="w-full bg-surface-3 border border-border rounded px-1.5 py-0.5 text-xs text-text-primary outline-none focus:border-accent/50 placeholder:text-text-muted"
              />
            </div>
          )}
          <div className="flex gap-1 border-b border-border px-2 py-1">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              All
            </button>
            <span className="text-text-muted">/</span>
            <button
              type="button"
              onClick={selectNone}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              None
            </button>
          </div>
          {uniqueValues.map(value => (
            <label
              key={value}
              className="flex items-center gap-2 px-2 py-1 text-xs text-text-primary hover:bg-surface-3 transition-colors cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedSet.has(value)}
                onChange={() => toggleValue(value)}
                className="h-3.5 w-3.5 accent-accent"
              />
              <span className="whitespace-nowrap">{meta.formatFilterValue?.(value) ?? value}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
