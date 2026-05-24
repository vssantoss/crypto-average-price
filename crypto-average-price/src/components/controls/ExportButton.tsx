import { useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import type { ProcessedRow } from '../../types/transaction'
import { useAppStore } from '../../store/useAppStore'
import { buildExportCsvRow, buildRawExportCsvRow, type ExportCsvOptions } from '../../parsers/exportSchema'
import { Dialog, DialogFooter, dialogCancelClass, dialogPrimaryClass, dialogSecondaryClass } from '../common/Dialog'
import { usePromiseDialog } from '../../hooks/usePromiseDialog'
import { Download, Save, X } from 'lucide-react'

interface ExportButtonProps {
  data: ProcessedRow[]
  allData: ProcessedRow[]
}

type SaveFilePicker = (options: {
  suggestedName: string
  types: Array<{
    description: string
    accept: Record<string, string[]>
  }>
}) => Promise<{
  name?: string
  createWritable: (options?: { keepExistingData?: boolean }) => Promise<{
    write: (data: Blob) => Promise<void>
    close: () => Promise<void>
  }>
}>

type SaveFileHandle = Awaited<ReturnType<SaveFilePicker>>
type LiveExportMode = 'current' | 'all'
type ExportRows = ReturnType<typeof buildExportRows>
type ExportErrorContext = 'live' | 'manual'

interface ExportErrorDialog {
  title: string
  message: string
}

/**
 * Builds output CSV rows from processed table rows.
 * @param data - Processed rows selected for export
 * @param options - Export options (e.g. whether to include calculated columns)
 * @returns Plain objects ready for PapaParse CSV serialization
 */
function buildExportRows(data: ProcessedRow[], options?: ExportCsvOptions) {
  const rawTransactions = useAppStore.getState().rawTransactions
  const rawMap = new Map(rawTransactions.map(r => [r.order, r]))

  if (options?.includeCalculated) {
    return data.map(row => buildExportCsvRow(row, rawMap.get(row.sourceOrder), options))
  }

  const seenSourceOrders = new Set<number>()
  const backupRows = []
  for (const row of data) {
    if (seenSourceOrders.has(row.sourceOrder)) continue
    const raw = rawMap.get(row.sourceOrder)
    if (!raw) continue
    backupRows.push(buildRawExportCsvRow(raw, row))
    seenSourceOrders.add(row.sourceOrder)
  }
  return backupRows
}

/**
 * Ensures an exported filename has the CSV extension.
 * @param filename - User-selected or generated filename
 * @returns Filename ending in .csv
 */
function ensureCsvExtension(filename: string): string {
  return filename.toLowerCase().endsWith('.csv') ? filename : `${filename}.csv`
}

/**
 * Gets the browser-native save picker when it is available.
 * @returns Save file picker function, or null for unsupported browsers
 */
function getSaveFilePicker(): SaveFilePicker | null {
  const typedWindow = window as Window & { showSaveFilePicker?: SaveFilePicker }
  return typedWindow.showSaveFilePicker ?? null
}

/**
 * Formats file write failures into a clear export message.
 * @param err - Error thrown while writing the selected CSV file
 * @param context - Whether the failure happened during live or manual export
 * @returns User-facing explanation for why export failed
 */
function getFileWriteErrorMessage(err: unknown, context: ExportErrorContext): string {
  const message = err instanceof Error ? err.message : String(err)
  const isLive = context === 'live'

  if (err instanceof DOMException && err.name === 'InvalidStateError') {
    if (isLive) {
      return 'The selected CSV file changed outside this app or is currently open in another program. Keep Updated was turned off. Close the file in the other app, then enable Keep Updated again and select the CSV file.'
    }

    return 'The app had a problem exporting the data. The selected CSV file changed outside this app or is currently open in another program, so the save did not finish. Close the file in the other app, then export again.'
  }

  if (isLive) {
    return `The selected CSV file could not be updated. Keep Updated was turned off. ${message}`
  }

  return `The app had a problem exporting the data. The selected CSV file could not be saved. ${message}`
}

/**
 * Builds the dialog copy for an export write failure.
 * @param err - Error thrown while writing the selected CSV file
 * @param context - Whether the failure happened during live or manual export
 * @returns Dialog title and message
 */
function buildExportErrorDialog(err: unknown, context: ExportErrorContext): ExportErrorDialog {
  return {
    title: context === 'live' ? 'Live Export Stopped' : 'Export Failed',
    message: getFileWriteErrorMessage(err, context),
  }
}

/**
 * Creates a CSV blob from export rows.
 * @param rows - Export row objects to serialize
 * @returns CSV blob with UTF-8 BOM
 */
function createCsvBlob(rows: ExportRows): Blob {
  const csv = Papa.unparse(rows)
  return new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
}

/**
 * Writes a CSV blob into an existing browser file handle.
 * @param handle - File handle chosen by the user
 * @param rows - Export row objects to serialize
 * @returns Promise that resolves after the file is fully written
 */
async function writeCsvToHandle(handle: SaveFileHandle, rows: ExportRows): Promise<void> {
  const writable = await handle.createWritable({ keepExistingData: true })
  await writable.write(createCsvBlob(rows))
  await writable.close()
}

/**
 * Asks the user to choose a CSV export file.
 * @param suggestedFilename - Default filename shown in the picker
 * @returns File handle, or null when unsupported or cancelled
 */
async function pickCsvFileHandle(suggestedFilename: string): Promise<SaveFileHandle | null> {
  const saveFilePicker = getSaveFilePicker()
  if (!saveFilePicker) return null

  try {
    return await saveFilePicker({
      suggestedName: ensureCsvExtension(suggestedFilename),
      types: [{
        description: 'CSV files',
        accept: { 'text/csv': ['.csv'] },
      }],
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') return null
    throw err
  }
}

/**
 * Saves a CSV file, letting the user pick the filename when the browser supports it.
 * @param rows - Export row objects to serialize
 * @param suggestedFilename - Default filename shown to the user
 * @returns Promise that resolves after the file is saved or cancelled
 */
async function saveCsvFile(
  rows: ExportRows,
  suggestedFilename: string,
  requestFilename: (suggestedFilename: string) => Promise<string | null>,
): Promise<string | null> {
  const filename = ensureCsvExtension(suggestedFilename)
  const handle = await pickCsvFileHandle(filename)

  if (handle) {
    await writeCsvToHandle(handle, rows)
    return handle.name ? ensureCsvExtension(handle.name) : filename
  }

  if (getSaveFilePicker()) return null

  const pickedFilename = (await requestFilename(filename))?.trim()
  if (!pickedFilename) return null
  const exportFilename = ensureCsvExtension(pickedFilename)

  const url = URL.createObjectURL(createCsvBlob(rows))
  const link = document.createElement('a')
  link.href = url
  link.download = exportFilename
  link.click()
  URL.revokeObjectURL(url)
  return exportFilename
}

/**
 * Renders the CSV export control and filtered export choice dialog.
 * @param props - Export button data and active filter state
 * @returns Export button element
 */
export function ExportButton({ data, allData }: ExportButtonProps) {
  const [showModal, setShowModal] = useState(false)
  const [showKeepUpdatedInfo, setShowKeepUpdatedInfo] = useState(false)
  const [showUnsupportedInfo, setShowUnsupportedInfo] = useState(false)
  const [exportError, setExportError] = useState<ExportErrorDialog | null>(null)
  const filenamePrompt = usePromiseDialog<string, string | null>()
  const [filenameDraft, setFilenameDraft] = useState('')
  const [lastExportFilename, setLastExportFilename] = useState<string | null>(null)
  const [keepUpdated, setKeepUpdated] = useState(false)
  const [includeCalculated, setIncludeCalculated] = useState(false)
  const [liveMode, setLiveMode] = useState<LiveExportMode | null>(null)
  const [liveHandle, setLiveHandle] = useState<SaveFileHandle | null>(null)
  const [liveStatus, setLiveStatus] = useState('')
  const liveWriteRunning = useRef(false)
  const liveWritePending = useRef(false)
  const activeTableFilters = useAppStore(s => s.activeTableFilters)
  const activeTableRowOrders = useAppStore(s => s.activeTableRowOrders)
  const dataByOrder = useMemo(() => new Map(data.map(row => [row.order, row])), [data])
  const currentData = useMemo(() => {
    if (!activeTableRowOrders) return data
    return activeTableRowOrders.flatMap(order => {
      const row = dataByOrder.get(order)
      return row ? [row] : []
    })
  }, [activeTableRowOrders, data, dataByOrder])
  const activeFilters = activeTableFilters.map(f => `${f.column}: "${f.value}"`)
  const liveRows = liveMode === 'all' ? allData : currentData

  /**
   * Opens an in-app filename prompt for browsers without native save picker support.
   * @param suggestedFilename - Default CSV filename
   * @returns Promise resolving to selected filename, or null when cancelled
   */
  function requestFallbackFilename(suggestedFilename: string): Promise<string | null> {
    setFilenameDraft(suggestedFilename)
    return filenamePrompt.request(suggestedFilename)
  }

  /**
   * Resolves and closes the fallback filename prompt.
   * @param filename - Filename to use, or null when cancelled
   */
  function closeFilenamePrompt(filename: string | null): void {
    filenamePrompt.resolve(filename)
  }

  useEffect(() => {
    if (!liveHandle || !liveMode) return
    const handle = liveHandle
    let cancelled = false

    /**
     * Writes current live export rows to the selected file.
     * @returns Promise that resolves after pending writes settle
     */
    async function writeLiveExport(): Promise<void> {
      if (cancelled) return

      if (liveWriteRunning.current) {
        liveWritePending.current = true
        return
      }

      liveWriteRunning.current = true
      setLiveStatus('Saving...')

      try {
        await writeCsvToHandle(handle, buildExportRows(liveRows, { includeCalculated }))
        if (!cancelled) setLiveStatus('Saved')
      } catch (err) {
        if (!cancelled) {
          setLiveHandle(null)
          setLiveMode(null)
          setKeepUpdated(false)
          setLiveStatus('')
          setExportError(buildExportErrorDialog(err, 'live'))
          liveWritePending.current = false
        }
      } finally {
        liveWriteRunning.current = false
        if (liveWritePending.current && !cancelled) {
          liveWritePending.current = false
          void writeLiveExport()
        }
      }
    }

    const timeout = window.setTimeout(() => {
      void writeLiveExport()
    }, 500)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [liveRows, liveHandle, liveMode, includeCalculated])

  /**
   * Builds the default export filename from current filter context.
   * @param opts - Optional filename suffix
   * @returns Suggested CSV filename
   */
  function getFilename(opts?: { suffix?: string }) {
    if (lastExportFilename) return lastExportFilename

    const parts = ['crypto-avg-price']
    if (opts?.suffix) parts.push(opts.suffix)
    parts.push(new Date().toISOString().split('T')[0])
    return parts.join('-') + '.csv'
  }

  /**
   * Starts or stops the keep-updated setup flow.
   * @param checked - Whether the keep-updated checkbox was enabled
   */
  function handleKeepUpdatedChange(checked: boolean): void {
    if (!checked) {
      setKeepUpdated(false)
      setExportError(null)
      return
    }

    if (liveHandle) return

    if (!getSaveFilePicker()) {
      setShowUnsupportedInfo(true)
      return
    }

    setShowKeepUpdatedInfo(true)
  }

  /**
   * Confirms live export setup and continues to file selection when no export choice is needed.
   * @returns Promise that resolves after the live export flow starts or waits for an export choice
   */
  async function confirmKeepUpdated(): Promise<void> {
    setShowKeepUpdatedInfo(false)
    setKeepUpdated(true)

    if (!showModal) {
      try {
        await exportRows('current', currentData, getFilename(), true)
      } catch (err) {
        setExportError(buildExportErrorDialog(err, 'live'))
      }
      return
    }

    if (activeFilters.length === 0) {
      try {
        setShowModal(false)
        await exportRows('current', currentData, getFilename(), true)
      } catch (err) {
        setExportError(buildExportErrorDialog(err, 'live'))
      }
    }
  }

  /**
   * Exports rows once or starts live export for the selected export mode.
   * @param mode - Whether to export the current view or all rows
   * @param rows - Processed rows to export now
   * @param filename - Suggested CSV filename
   * @param forceKeepUpdated - Whether to start live export regardless of checkbox state
   * @returns Promise that resolves after export setup finishes
   */
  async function exportRows(
    mode: LiveExportMode,
    rows: ProcessedRow[],
    filename: string,
    forceKeepUpdated = false,
  ): Promise<void> {
    const rowsToExport = buildExportRows(rows, { includeCalculated })

    if (!keepUpdated && !forceKeepUpdated) {
      const savedFilename = await saveCsvFile(rowsToExport, filename, requestFallbackFilename)
      if (savedFilename) setLastExportFilename(savedFilename)
      return
    }

    const handle = await pickCsvFileHandle(filename)
    if (!handle) {
      if (!getSaveFilePicker()) {
        setShowUnsupportedInfo(true)
      }
      return
    }

    try {
      await writeCsvToHandle(handle, rowsToExport)
    } catch (err) {
      setKeepUpdated(false)
      setLiveHandle(null)
      setLiveMode(null)
      setLiveStatus('')
      setExportError(buildExportErrorDialog(err, 'live'))
      return
    }

    setLiveHandle(handle)
    setLiveMode(mode)
    setLiveStatus('Saved')
    setLastExportFilename(handle.name ? ensureCsvExtension(handle.name) : ensureCsvExtension(filename))
  }

  /**
   * Opens the export options dialog.
   */
  function handleExport(): void {
    if (allData.length === 0) return
    setShowModal(true)
  }

  /**
   * Exports the currently filtered table rows.
   * @returns Promise that resolves after saving or cancellation
   */
  async function exportFiltered(): Promise<void> {
    try {
      setShowModal(false)
      const suffix = activeFilters.length > 0 ? 'filtered' : undefined
      await exportRows('current', currentData, getFilename({ suffix }))
    } catch (err) {
      setExportError(buildExportErrorDialog(err, keepUpdated ? 'live' : 'manual'))
    }
  }

  /**
   * Exports all computed rows, ignoring current table filters.
   * @returns Promise that resolves after saving or cancellation
   */
  async function exportAll(): Promise<void> {
    try {
      setShowModal(false)
      await exportRows('all', allData, getFilename())
    } catch (err) {
      setExportError(buildExportErrorDialog(err, keepUpdated ? 'live' : 'manual'))
    }
  }

  /**
   * Stops writing changes to the selected live export file.
   */
  function stopLiveExport(): void {
    setLiveHandle(null)
    setLiveMode(null)
    setLiveStatus('')
    setKeepUpdated(false)
  }

  return (
    <div className="flex items-center gap-2">
      {!liveHandle && (
        <button
          onClick={handleExport}
          disabled={allData.length === 0}
          className="flex items-center gap-1.5 bg-surface-2 border border-border rounded px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-border-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download size={13} />
          Export CSV
        </button>
      )}

      {liveHandle && (
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <Save size={13} className={liveStatus === 'Saving...' ? 'text-accent animate-pulse' : 'text-success'} />
          <span>{liveMode === 'all' ? 'All rows' : 'Current view'}: {liveStatus}</span>
          <button
            onClick={stopLiveExport}
            className="text-text-muted hover:text-danger transition-colors"
            title="Stop live export"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {showKeepUpdatedInfo && (
        <Dialog open={showKeepUpdatedInfo} onClose={() => setShowKeepUpdatedInfo(false)} title="Keep Export Updated" zIndex="z-[60]">
          <p className="text-xs text-text-secondary mb-4">
            To keep a CSV updated while you work, choose the export file once and allow this page to write to it. The file will update automatically until you stop live export or close the page.
          </p>
          <DialogFooter>
            <button
              onClick={() => setShowKeepUpdatedInfo(false)}
              className={dialogCancelClass}
            >
              Cancel
            </button>
            <button
              onClick={() => void confirmKeepUpdated()}
              className={dialogPrimaryClass}
            >
              Select file
            </button>
          </DialogFooter>
        </Dialog>
      )}

      {filenamePrompt.payload && (
        <Dialog open={filenamePrompt.open} onClose={() => closeFilenamePrompt(null)} title="Export Filename" zIndex="z-[60]">
          <label className="flex flex-col gap-1 mb-4">
            <span className="text-xs text-text-secondary">Filename</span>
            <input
              type="text"
              value={filenameDraft}
              onChange={e => setFilenameDraft(e.target.value)}
              placeholder={filenamePrompt.payload}
              className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50 placeholder:text-text-muted"
            />
          </label>
          <DialogFooter>
            <button
              onClick={() => closeFilenamePrompt(null)}
              className={dialogCancelClass}
            >
              Cancel
            </button>
            <button
              onClick={() => closeFilenamePrompt(filenameDraft)}
              disabled={!filenameDraft.trim()}
              className={dialogPrimaryClass}
            >
              Export
            </button>
          </DialogFooter>
        </Dialog>
      )}

      {showUnsupportedInfo && (
        <Dialog open={showUnsupportedInfo} onClose={() => setShowUnsupportedInfo(false)} title="Keep Updated Unavailable" zIndex="z-[60]">
          <p className="text-xs text-text-secondary mb-4">
            This browser does not allow the app to keep writing to a selected file. Use a Chromium-based browser with file-system access, or export manually when you want a new CSV.
          </p>
          <DialogFooter>
            <button
              onClick={() => setShowUnsupportedInfo(false)}
              className={dialogSecondaryClass}
            >
              OK
            </button>
          </DialogFooter>
        </Dialog>
      )}

      {exportError && (
        <Dialog open={!!exportError} onClose={() => setExportError(null)} title={exportError.title} zIndex="z-[60]">
          <p className="text-xs text-text-secondary mb-4">
            {exportError.message}
          </p>
          <DialogFooter>
            <button
              onClick={() => setExportError(null)}
              className={dialogSecondaryClass}
            >
              OK
            </button>
          </DialogFooter>
        </Dialog>
      )}

      {showModal && (
        <Dialog open={showModal} onClose={() => setShowModal(false)} title="Export CSV">
          {activeFilters.length > 0 && (
            <>
              <p className="text-xs text-text-secondary mb-2">Active filters:</p>
              <ul className="mb-4 space-y-1">
                {activeFilters.map((f, i) => (
                  <li key={i} className="text-xs text-text-primary flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-accent shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-text-secondary mb-4">
                Export filtered data ({currentData.length} rows) or all data ({allData.length} rows)?
              </p>
            </>
          )}

          <div className="flex flex-col gap-2 mb-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeCalculated}
                onChange={e => setIncludeCalculated(e.target.checked)}
                className="h-3.5 w-3.5 accent-accent"
              />
              <span className="text-xs text-text-secondary">Include calculated fields (useful for Excel)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={keepUpdated}
                onChange={e => handleKeepUpdatedChange(e.target.checked)}
                disabled={!!liveHandle}
                className="h-3.5 w-3.5 accent-accent"
              />
              <span className="text-xs text-text-secondary">Keep file updated while page is open</span>
            </label>
          </div>

          <DialogFooter>
            <button
              onClick={() => setShowModal(false)}
              className={dialogCancelClass}
            >
              Cancel
            </button>
            {activeFilters.length > 0 && currentData.length > 0 && (
              <button
                onClick={() => void exportFiltered()}
                className={dialogSecondaryClass}
              >
                Export filtered
              </button>
            )}
            <button
              onClick={() => void (activeFilters.length > 0 ? exportAll() : exportFiltered())}
              className={dialogPrimaryClass}
            >
              {activeFilters.length > 0 ? 'Export all' : 'Export'}
            </button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  )
}
