import { useAppStore } from '../../store/useAppStore'
import type { CoinSummary } from '../../types/app'
import { formatBrl, formatNumber } from '../../utils/number'
import { Coins } from 'lucide-react'

interface SummaryPanelProps {
  summaries: CoinSummary[]
}

/**
 * Displays summary statistics for each instrument.
 * Shows current balance, average price, and BRL balance.
 * @param props - Summary rows to display
 * @returns Summary panel element
 */
export function SummaryPanel({ summaries }: SummaryPanelProps) {
  const ptaxMap = useAppStore(s => s.ptaxMap)
  const displaySummaries = summaries

  if (displaySummaries.length === 0) return null

  return (
    <div className="flex flex-wrap gap-3">
      {displaySummaries.map(summary => (
        <div
          key={summary.instrument}
          className="bg-surface-2 border border-border rounded-lg px-4 py-3 min-w-[200px]"
        >
          <div className="flex items-center gap-2 mb-2">
            <Coins size={16} className="text-accent" />
            <span className="text-sm font-medium text-text-primary">{summary.instrument}</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-xs text-text-muted">Balance:</span>
              <span className="text-xs text-text-primary font-mono">
                {formatNumber(summary.currentBalance, 4)}
              </span>
            </div>
            {summary.averagePrice !== null && (
              <div className="flex justify-between gap-4">
                <span className="text-xs text-text-muted">Avg Price:</span>
                <span className="text-xs text-text-primary font-mono">
                  {formatBrl(summary.averagePrice)}
                </span>
              </div>
            )}
            {summary.brlBalance !== null && (
              <div className="flex justify-between gap-4">
                <span className="text-xs text-text-muted">BRL Balance:</span>
                <span className="text-xs text-text-primary font-mono">
                  {formatBrl(summary.brlBalance)}
                </span>
              </div>
            )}
          </div>
        </div>
      ))}
      {ptaxMap.size > 0 && (
        <div className="bg-surface-2 border border-border rounded-lg px-4 py-3 min-w-[160px]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-text-primary">PTAX</span>
          </div>
          <div className="text-xs text-text-muted">
            {ptaxMap.size} rates loaded
          </div>
        </div>
      )}
    </div>
  )
}
