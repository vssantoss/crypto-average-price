import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from './store/useAppStore'
import type { DuplicateImportDecision, DuplicateImportSummary } from './store/useAppStore'
import { useAppComputedData } from './store/selectors'
import { CoinSelector } from './components/controls/CoinSelector'
import { UsdMergeToggle } from './components/controls/UsdMergeToggle'
import { ColumnVisibility } from './components/controls/ColumnVisibility'
import { ExportButton } from './components/controls/ExportButton'
import { TimezoneSelector } from './components/controls/TimezoneSelector'
import { RoundBalanceToggle } from './components/controls/RoundBalanceToggle'
import { DiagnosticsButton } from './components/controls/DiagnosticsButton'
import { DataTable } from './components/table/DataTable'
import { EmptyState, LoadingCard } from './components/layout/EmptyState'
import { RecoveryDialog } from './components/dialogs/RecoveryDialog'
import { AddRowDialog } from './components/dialogs/AddRowDialog'
import { ImportTransactionsDialog } from './components/dialogs/ImportTransactionsDialog'
import { Dialog, DialogFooter, dialogCancelClass, dialogPrimaryClass } from './components/common/Dialog'
import { usePromiseDialog } from './hooks/usePromiseDialog'
import { AlertTriangle, Trash2, ChevronDown, ChevronUp, FileUp, FolderInput, FileSpreadsheet, Plus } from 'lucide-react'

function App() {
  const { processedRows, allProcessedRows, ptaxWarnings, diagnostics } = useAppComputedData()
  const error = useAppStore(s => s.error)
  const isLoading = useAppStore(s => s.isLoading)
  const hasData = useAppStore(s => s.rawTransactions.length > 0)
  const clearAll = useAppStore(s => s.clearAll)
  const ptaxSize = useAppStore(s => s.ptaxMap.size)
  const importPtax = useAppStore(s => s.importPtax)
  const importExported = useAppStore(s => s.importExported)

  const [showAddRow, setShowAddRow] = useState(false)
  const [importFiles, setImportFiles] = useState<File[]>([])
  const [createDuplicateRows, setCreateDuplicateRows] = useState(false)
  const duplicateConfirm = usePromiseDialog<DuplicateImportSummary, DuplicateImportDecision>()
  const expanded = useAppStore(s => s.settings.panelExpanded)
  const setPanelExpanded = useAppStore(s => s.setPanelExpanded)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const txRef = useRef<HTMLInputElement>(null)
  const ptaxRef = useRef<HTMLInputElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)

  const expandTemporarily = useCallback(() => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current)
    setPanelExpanded(false)
    collapseTimer.current = setTimeout(() => {
      setPanelExpanded(true)
      collapseTimer.current = null
    }, 400)
  }, [setPanelExpanded])

  useEffect(() => {
    const timerRef = collapseTimer
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  const handleImportTransactions = (files: FileList) => {
    setImportFiles(Array.from(files))
  }

  /**
   * Closes the transaction import dialog.
   */
  const cancelTransactionImport = () => {
    setImportFiles([])
  }

  /**
   * Handles a successful transaction import and expands the options panel.
   */
  const completeTransactionImport = () => {
    setImportFiles([])
    expandTemporarily()
  }

  /**
   * Opens the duplicate import confirmation dialog and resets its checkbox.
   * @param summary - Duplicate import counts shown in the dialog
   * @returns Promise resolving to the duplicate handling decision
   */
  const confirmDuplicateImport = (summary: DuplicateImportSummary): Promise<DuplicateImportDecision> => {
    setCreateDuplicateRows(false)
    return duplicateConfirm.request(summary)
  }

  const handleImportPtax = async (files: FileList) => {
    await importPtax(files)
  }

  const handleImportBackup = async (file: File) => {
    await importExported(file)
    expandTemporarily()
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden min-w-[1280px]">
      <RecoveryDialog />
      <AddRowDialog open={showAddRow} onClose={() => setShowAddRow(false)} />

      {importFiles.length > 0 && (
        <ImportTransactionsDialog
          files={importFiles}
          onClose={cancelTransactionImport}
          onComplete={completeTransactionImport}
          confirmDuplicates={confirmDuplicateImport}
        />
      )}

      {duplicateConfirm.payload && (
        <Dialog open={duplicateConfirm.open} onClose={() => duplicateConfirm.resolve('cancel')} title="Duplicate Transactions" zIndex="z-[60]" maxWidth="max-w-md">
          <p className="text-xs text-text-secondary mb-4">
            The selected file{duplicateConfirm.payload.fileCount > 1 ? 's contain' : ' contains'} {duplicateConfirm.payload.totalCount} transaction{duplicateConfirm.payload.totalCount === 1 ? '' : 's'}.
          </p>
          <p className="text-xs text-text-secondary mb-4">
            {duplicateConfirm.payload.duplicateCount} transaction{duplicateConfirm.payload.duplicateCount === 1 ? ' is' : 's are'} duplicated and {duplicateConfirm.payload.importedCount} transaction{duplicateConfirm.payload.importedCount === 1 ? ' is' : 's are'} new.
          </p>
          <label className="flex items-center gap-2 mb-5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={createDuplicateRows}
              onChange={e => setCreateDuplicateRows(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            <span className="text-xs text-text-secondary">Create duplicated transactions</span>
          </label>
          <DialogFooter>
            <button
              onClick={() => duplicateConfirm.resolve('cancel')}
              className={dialogCancelClass}
            >
              Cancel
            </button>
            <button
              onClick={() => duplicateConfirm.resolve(createDuplicateRows ? 'include' : 'skip')}
              className={dialogPrimaryClass}
            >
              Continue
            </button>
          </DialogFooter>
        </Dialog>
      )}

      {/* Fixed top bar */}
      <header className="bg-surface-1 border-b border-border shrink-0 z-40">
        {/* Main bar row */}
        <div className="flex items-center justify-between h-10 px-3">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-text-primary">Crypto Average Price</h1>
          </div>
          <div className="flex items-center gap-2">
            <input ref={txRef} type="file" accept=".csv" multiple className="hidden" onChange={e => {
              const files = e.target.files
              if (files && files.length > 0) handleImportTransactions(files)
              e.target.value = ''
            }} />
            <input ref={backupRef} type="file" accept=".csv" className="hidden" onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleImportBackup(file)
              e.target.value = ''
            }} />
            {hasData && (
              <>
                <button
                  onClick={() => txRef.current?.click()}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 bg-accent/10 border border-accent/30 rounded px-2.5 py-1 text-xs text-accent hover:bg-accent/20 transition-colors disabled:opacity-40"
                >
                  <FileUp size={13} />
                  Import Transactions
                </button>

                <button
                  onClick={() => backupRef.current?.click()}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 bg-surface-2 border border-border rounded px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40"
                >
                  <FolderInput size={13} />
                  Import Backup
                </button>

                <button
                  onClick={clearAll}
                  className="flex items-center gap-1.5 bg-surface-2 border border-border rounded px-2.5 py-1 text-xs text-text-secondary hover:text-danger hover:border-danger/30 transition-colors"
                >
                  <Trash2 size={13} />
                  Clear
                </button>
                <button
                  onClick={() => {
                    if (collapseTimer.current) clearTimeout(collapseTimer.current)
                    setPanelExpanded(!expanded)
                  }}
                  className="flex items-center text-text-muted hover:text-text-primary transition-colors p-1"
                  title={expanded ? 'Collapse options' : 'Expand options'}
                >
                  {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Expandable options panel */}
        <div className={`transition-all duration-300 ${expanded && hasData ? 'max-h-40 overflow-visible' : 'max-h-0 overflow-hidden'}`}>
          <div className="px-3 py-2 border-t border-border/50 flex flex-wrap items-center gap-3">
            <CoinSelector />
            <UsdMergeToggle />
            <RoundBalanceToggle />
            <TimezoneSelector />

            <div className="w-px h-5 bg-border/50" />

            <ColumnVisibility />

            <div className="w-px h-5 bg-border/50" />

            <input ref={ptaxRef} type="file" accept=".csv" multiple className="hidden" onChange={e => {
              const files = e.target.files
              if (files && files.length > 0) handleImportPtax(files)
              e.target.value = ''
            }} />
            <button
              onClick={() => ptaxRef.current?.click()}
              disabled={isLoading}
              className="flex items-center gap-1.5 bg-surface-2 border border-border rounded px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-40"
            >
              <FileSpreadsheet size={13} />
              Import PTAX
            </button>

            <button
              onClick={() => setShowAddRow(true)}
              className="flex items-center gap-1.5 bg-surface-2 border border-border rounded px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
            >
              <Plus size={13} />
              Add Transaction
            </button>

            <div className="flex-1" />

            <DiagnosticsButton messages={diagnostics} />
            <ExportButton
              data={processedRows}
              allData={allProcessedRows}
            />
          </div>

          {/* Error display */}
          {error && (
            <div className="mx-3 mb-2 bg-danger/10 border border-danger/30 rounded px-3 py-1.5 text-xs text-danger">
              {error}
            </div>
          )}

          {/* PTAX warnings */}
          {ptaxWarnings.length > 0 && (
            <div className="mx-3 mb-2 bg-warning/10 border border-warning/30 rounded px-3 py-1.5">
              <div className="flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle size={12} />
                <span>
                  Missing PTAX for {ptaxWarnings.length} date{ptaxWarnings.length > 1 ? 's' : ''}.
                  {ptaxSize === 0 ? ' Import a PTAX CSV.' : ' Import additional PTAX files.'}
                </span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* DataTable fills remaining space */}
      <main className="flex-1 min-h-0 relative">
        {hasData ? (
          <DataTable data={processedRows} />
        ) : (
          <EmptyState
            onImportTransactions={() => txRef.current?.click()}
            onImportBackup={() => backupRef.current?.click()}
            isLoading={isLoading}
          />
        )}
        {isLoading && hasData && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-surface-0/80">
            <LoadingCard />
          </div>
        )}
      </main>
    </div>
  )
}

export default App
