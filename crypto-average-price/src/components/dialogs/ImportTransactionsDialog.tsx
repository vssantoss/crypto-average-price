import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { DuplicateImportDecision, DuplicateImportSummary } from '../../store/useAppStore'
import { useExchangeList } from '../../store/selectors'
import { Dialog, DialogFooter, dialogCancelClass, dialogPrimaryClass } from '../common/Dialog'
import { hasBackupCsvHeaders, parseCryptoComCsv } from '../../parsers/cryptoCom'

interface ImportTransactionsDialogProps {
  files: File[]
  onClose: () => void
  onComplete: () => void
  confirmDuplicates: (summary: DuplicateImportSummary) => Promise<DuplicateImportDecision>
}

interface TransactionFileImport {
  file: File
  exchangeName: string
}

interface BackupImportWarning {
  fileNames: string[]
}

type ImportPreflightStatus = 'checking' | 'ready' | 'error'

/**
 * Parses the first CSV row into header names.
 * @param text - Raw CSV file text
 * @returns Header names from the first row
 */
function parseCsvHeaderFields(text: string): string[] {
  const headerLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] || ''
  return headerLine.split(',').map(header => header.trim().replace(/^"|"$/g, ''))
}

/**
 * Checks whether the selected file has app backup CSV headers.
 * @param file - Selected CSV file
 * @returns Promise resolving to true when the file looks like a backup export
 */
async function fileHasBackupHeaders(file: File): Promise<boolean> {
  const text = await file.text()
  return hasBackupCsvHeaders(parseCsvHeaderFields(text))
}

/**
 * Renders the transaction import dialog and owns exchange-name input state locally.
 * @param props - Selected files, close handler, completion handler, and duplicate confirmation callback
 * @returns Import transactions dialog element
 */
export function ImportTransactionsDialog({
  files,
  onClose,
  onComplete,
  confirmDuplicates,
}: ImportTransactionsDialogProps) {
  const importTransactions = useAppStore(s => s.importTransactions)
  const knownExchanges = useExchangeList()
  const [exchangeNames, setExchangeNames] = useState(() => files.map(() => ''))
  const [importError, setImportError] = useState('')
  const [preflightStatus, setPreflightStatus] = useState<ImportPreflightStatus>('checking')
  const [backupWarning, setBackupWarning] = useState<BackupImportWarning | null>(null)

  useEffect(() => {
    let cancelled = false

    /**
     * Checks selected files before showing exchange-name inputs.
     * @returns Promise that resolves when the preflight status is updated
     */
    async function runPreflight(): Promise<void> {
      setImportError('')
      setBackupWarning(null)
      setPreflightStatus('checking')

      try {
        const backupFileNames: string[] = []

        for (const file of files) {
          if (await fileHasBackupHeaders(file)) {
            backupFileNames.push(file.name)
            continue
          }

          await parseCryptoComCsv(file)
        }

        if (cancelled) return

        if (backupFileNames.length > 0) {
          setBackupWarning({ fileNames: backupFileNames })
          setPreflightStatus('error')
          return
        }

        setPreflightStatus('ready')
      } catch (err) {
        if (cancelled) return
        setImportError((err as Error).message)
        setPreflightStatus('error')
      }
    }

    void runPreflight()

    return () => {
      cancelled = true
    }
  }, [files])

  /**
   * Updates one exchange name without re-rendering the application shell.
   * @param index - Selected file index
   * @param value - Exchange name typed by the user
   */
  function updateExchangeName(index: number, value: string): void {
    setExchangeNames(current => {
      const next = [...current]
      next[index] = value
      return next
    })
  }

  /**
   * Runs the transaction import and keeps the dialog open when the import fails.
   * @param imports - Files and exchange names to import
   * @returns Promise that resolves after import succeeds, fails, or is cancelled
   */
  async function runTransactionImport(imports: TransactionFileImport[]): Promise<void> {
    setImportError('')
    const result = await importTransactions(imports, { confirmDuplicates })
    if (result.error) {
      setImportError(result.error)
      return
    }
    if (result.cancelled) return
    onComplete()
  }

  /**
   * Imports selected transaction files after validating exchange names.
   * @returns Promise that resolves after import succeeds, fails, or is cancelled
   */
  async function submitTransactionImport(): Promise<void> {
    const imports = files.map((file, index) => ({
      file,
      exchangeName: exchangeNames[index]?.trim() || '',
    }))

    if (imports.some(item => !item.exchangeName)) {
      setImportError('Exchange name is required for every selected file.')
      return
    }

    await runTransactionImport(imports)
  }

  return (
    <Dialog open={files.length > 0} onClose={onClose} title="Import Transactions" maxWidth="max-w-lg">
      {preflightStatus === 'checking' && (
        <p className="text-xs text-text-secondary mb-4">
          Checking selected file{files.length === 1 ? '' : 's'}...
        </p>
      )}

      {preflightStatus === 'ready' && (
        <>
          <p className="text-xs text-text-secondary mb-4">
            Set the exchange name for each selected transaction file.
          </p>

          <div className="flex flex-col gap-3 max-h-[320px] overflow-y-auto">
            {files.map((file, index) => (
              <label key={`${file.name}-${index}`} className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary">{file.name}</span>
                <input
                  type="text"
                  list="import-exchange-options"
                  value={exchangeNames[index] || ''}
                  onChange={e => updateExchangeName(index, e.target.value)}
                  placeholder="Exchange name"
                  className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50 placeholder:text-text-muted"
                />
              </label>
            ))}
            <datalist id="import-exchange-options">
              {knownExchanges.map(exchange => (
                <option key={exchange} value={exchange} />
              ))}
            </datalist>
          </div>
        </>
      )}

      {importError && (
        <div className="mt-3 text-xs text-danger">{importError}</div>
      )}

      <DialogFooter>
        <button
          onClick={onClose}
          className={dialogCancelClass}
        >
          {preflightStatus === 'ready' ? 'Cancel' : 'Close'}
        </button>
        {preflightStatus === 'ready' && (
          <button
            onClick={() => void submitTransactionImport()}
            className={dialogPrimaryClass}
          >
            Import
          </button>
        )}
      </DialogFooter>

      {backupWarning && (
        <Dialog open={!!backupWarning} onClose={onClose} title="Backup File Selected" zIndex="z-[60]" maxWidth="max-w-md">
          <p className="text-xs text-text-secondary mb-3">
            This is a backup file. Use Import Backup to restore manually typed values like BRL costs, average price seeds, balance overrides, and notes. Without those values, some calculations cannot be restored.
          </p>
          <p className="text-xs text-text-secondary mb-4">
            Continue importing as transactions?
          </p>
          <ul className="mb-4 space-y-1">
            {backupWarning.fileNames.map(fileName => (
              <li key={fileName} className="text-xs text-text-primary">{fileName}</li>
            ))}
          </ul>
          <DialogFooter>
            <button
              onClick={onClose}
              className={dialogCancelClass}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setBackupWarning(null)
                setPreflightStatus('ready')
              }}
              className={dialogPrimaryClass}
            >
              Continue
            </button>
          </DialogFooter>
        </Dialog>
      )}
    </Dialog>
  )
}
