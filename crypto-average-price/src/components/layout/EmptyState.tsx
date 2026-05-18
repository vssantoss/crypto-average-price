import { FileUp, FolderInput, Loader2 } from 'lucide-react'

const cardClass = 'bg-surface-1 border border-border rounded-lg shadow-xl max-w-sm w-full p-8 text-center'

interface EmptyStateProps {
  onImportTransactions: () => void
  onImportBackup: () => void
  isLoading?: boolean
}

export function EmptyState({ onImportTransactions, onImportBackup, isLoading }: EmptyStateProps) {
  if (isLoading) return <LoadingCard />

  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className={cardClass}>
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center">
            <FileUp size={22} className="text-accent" />
          </div>
        </div>

        <h2 className="text-sm font-semibold text-text-primary mb-1">
          Crypto Average Price
        </h2>
        <p className="text-xs text-text-secondary mb-6">
          Import a Crypto.com transaction report to calculate your average costs, balances, and profit/loss in BRL.
        </p>

        <button
          onClick={onImportTransactions}
          className="w-full flex items-center justify-center gap-2 bg-accent/20 border border-accent/40 rounded px-4 py-2 text-xs text-accent hover:bg-accent/30 transition-colors"
        >
          <FileUp size={14} />
          Import Transactions
        </button>

        <button
          onClick={onImportBackup}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-surface-2 border border-border rounded px-4 py-2 text-xs text-text-secondary hover:text-text-primary hover:border-border-light transition-colors"
        >
          <FolderInput size={14} />
          Import Backup
        </button>
      </div>
    </div>
  )
}

export function LoadingCard() {
  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className={cardClass}>
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/30 flex items-center justify-center">
            <Loader2 size={22} className="text-accent animate-spin" />
          </div>
        </div>

        <h2 className="text-sm font-semibold text-text-primary mb-1">
          Processing...
        </h2>
        <p className="text-xs text-text-secondary">
          Importing and processing your transactions.
        </p>
      </div>
    </div>
  )
}
