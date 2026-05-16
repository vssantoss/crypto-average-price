import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { DuplicateImportDecision, DuplicateImportSummary } from '../../store/useAppStore'
import { useExchangeList } from '../../store/selectors'
import { Dialog } from '../common/Dialog'

interface ImportTransactionsDialogProps {
  files: File[]
  onClose: () => void
  onComplete: () => void
  confirmDuplicates: (summary: DuplicateImportSummary) => Promise<DuplicateImportDecision>
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

    const result = await importTransactions(imports, { confirmDuplicates })
    if (result.cancelled) return
    onComplete()
  }

  return (
    <Dialog open={files.length > 0} onClose={onClose} title="Import Transactions" maxWidth="max-w-lg">
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

      {importError && (
        <div className="mt-3 text-xs text-danger">{importError}</div>
      )}

      <div className="flex gap-2 justify-end mt-5">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => void submitTransactionImport()}
          className="px-3 py-1.5 text-xs bg-accent/20 border border-accent/40 rounded text-accent hover:bg-accent/30 transition-colors"
        >
          Import
        </button>
      </div>
    </Dialog>
  )
}
