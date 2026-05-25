import { useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { useExchangeList, useInstrumentList } from '../../store/selectors'
import { JournalType, OnchainWithdrawalRole, Wallet } from '../../types/transaction'
import type { CryptoComRow, TradeSide } from '../../types/transaction'
import { parseCryptoComDate } from '../../utils/date'
import { Dialog, DialogFooter, dialogCancelClass, dialogPrimaryClass } from '../common/Dialog'
import { Info, X } from 'lucide-react'

interface AddRowDialogProps {
  open: boolean
  onClose: () => void
  editRow?: CryptoComRow | null
}

const journalTypes = Object.values(JournalType)
const walletOptions = Object.values(Wallet)
const onchainWithdrawalRoles = [OnchainWithdrawalRole.DISPOSITION, OnchainWithdrawalRole.TRANSFER]

/**
 * Returns the current UTC time as a formatted string: MM/DD/YYYY HH:MM:SS.
 * @returns Current UTC timestamp string
 */
function nowUtcString(): string {
  const d = new Date()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const y = d.getUTCFullYear()
  const h = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  const s = String(d.getUTCSeconds()).padStart(2, '0')
  return `${mo}/${day}/${y} ${h}:${mi}:${s}`
}

/**
 * Parses a date/time string in 24h or 12h format into component parts.
 * Accepts MM/DD/YYYY HH:MM:SS or MM/DD/YYYY HH:MM:SS AM/PM.
 * @param timeUtc - Date/time string to parse
 * @returns Parsed date components, or null if the format is invalid
 */
function parseDateTime(timeUtc: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } | null {
  const str = timeUtc.trim()
  // Try 24h: MM/DD/YYYY HH:MM:SS
  let match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/)
  if (match) {
    const [, mo, d, y, h, mi, s] = match.map(Number)
    return { y, mo, d, h, mi, s }
  }
  // Try 12h: MM/DD/YYYY HH:MM:SS AM/PM
  match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i)
  if (match) {
    const [, moS, dS, yS, hS, miS, sS, ampm] = match
    let h = Number(hS)
    const mo = Number(moS), d = Number(dS), y = Number(yS), mi = Number(miS), s = Number(sS)
    if (h < 1 || h > 12) return null
    if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12
    if (ampm.toUpperCase() === 'AM' && h === 12) h = 0
    return { y, mo, d, h, mi, s }
  }
  return null
}

/**
 * Validates that a date/time string parses to a real calendar date.
 * Checks that the parsed components round-trip through Date correctly.
 * @param timeUtc - Date/time string to validate
 * @returns True if the string represents a valid date
 */
function isValidDate(timeUtc: string): boolean {
  const p = parseDateTime(timeUtc)
  if (!p) return false
  const date = new Date(Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s))
  return (
    date.getUTCFullYear() === p.y &&
    date.getUTCMonth() === p.mo - 1 &&
    date.getUTCDate() === p.d &&
    date.getUTCHours() === p.h &&
    date.getUTCMinutes() === p.mi &&
    date.getUTCSeconds() === p.s
  )
}

/**
 * Normalizes a date/time string to 24-hour format: MM/DD/YYYY HH:MM:SS.
 * Converts 12h AM/PM format to 24h. Returns trimmed input if parsing fails.
 * @param timeUtc - Date/time string to normalize
 * @returns Normalized 24h format string
 */
function normalizeTo24h(timeUtc: string): string {
  const p = parseDateTime(timeUtc)
  if (!p) return timeUtc.trim()
  const mo = String(p.mo).padStart(2, '0')
  const d = String(p.d).padStart(2, '0')
  const h = String(p.h).padStart(2, '0')
  const mi = String(p.mi).padStart(2, '0')
  const s = String(p.s).padStart(2, '0')
  return `${mo}/${d}/${p.y} ${h}:${mi}:${s}`
}

/**
 * Normalizes an instrument name for storage.
 * Uppercases the input, with special handling for the merged USD stable coin name.
 * @param instrument - Raw instrument name from user input
 * @returns Normalized instrument name
 */
function normalizeInstrumentInput(instrument: string): string {
  const trimmed = instrument.trim()
  if (trimmed.toUpperCase() === 'USD_STABLE_COIN') return 'USD_Stable_Coin'
  return trimmed.toUpperCase()
}

/**
 * Formats a wallet value for display in the add/edit form.
 * @param wallet - Wallet value to format
 * @returns Human-readable wallet label
 */
function formatWallet(wallet: Wallet): string {
  return wallet === Wallet.EXTERNAL ? 'External Wallet' : 'Trading Wallet'
}

/**
 * Formats an on-chain withdrawal role for display in the form.
 * @param role - Role value to format
 * @returns Human-readable role label
 */
function formatOnchainWithdrawalRole(role: OnchainWithdrawalRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

interface AddRowFormState {
  timeUtc: string
  journalType: JournalType
  exchangeName: string
  wallet: Wallet
  onchainWithdrawalRole: OnchainWithdrawalRole
  onchainReceivedQuantity: string
  instrument: string
  side: TradeSide
  quantity: string
  cost: string
  takerSide: string
  balanceOverride: string
  userBrlCost: string
}

/**
 * Checks whether a journal type is a manual non-transaction update row.
 * @param journalType - Journal type selected in the form
 * @returns True when the row should anchor manually entered information
 */
function isManualUpdate(journalType: JournalType): boolean {
  return journalType === JournalType.MANUAL_UPDATE
}

/**
 * Checks whether a journal type manually adds or removes balance.
 * @param journalType - Journal type selected in the form
 * @returns True when the row should apply a signed quantity delta
 */
function isManualAdjustment(journalType: JournalType): boolean {
  return journalType === JournalType.MANUAL_ADJUSTMENT
}

/**
 * Checks whether a journal type is a manual sale from offchain holdings.
 * @param journalType - Journal type selected in the form
 * @returns True when the row should consume external balance and use BRL proceeds
 */
function isOffchainSale(journalType: JournalType): boolean {
  return journalType === JournalType.OFFCHAIN_SALE
}

/**
 * Checks whether a journal type transfers holdings from Trading Wallet to External Wallet.
 * @param journalType - Journal type selected in the form
 * @returns True when the wallet is implied by transfer semantics
 */
function isOffchainWithdrawal(journalType: JournalType): boolean {
  return journalType === JournalType.OFFCHAIN_WITHDRAWAL
}

/**
 * Checks whether a journal type is an ambiguous on-chain withdrawal.
 * @param journalType - Journal type selected in the form
 * @returns True when the row needs a withdrawal role
 */
function isOnchainWithdrawal(journalType: JournalType): boolean {
  return journalType === JournalType.ONCHAIN_WITHDRAWAL
}

/**
 * Creates the initial form state for adding or editing a transaction row.
 * When editing, populates fields from the existing row; otherwise uses defaults.
 * @param editRow - Existing row to edit, or null/undefined for a new row
 * @returns Initial form state object
 */
function createInitialFormState(editRow?: CryptoComRow | null): AddRowFormState {
  if (!editRow) {
    return {
      timeUtc: nowUtcString(),
      journalType: JournalType.TRADING,
      exchangeName: '',
      wallet: Wallet.TRADING,
      onchainWithdrawalRole: OnchainWithdrawalRole.DISPOSITION,
      onchainReceivedQuantity: '',
      instrument: '',
      side: null,
      quantity: '',
      cost: '',
      takerSide: '',
      balanceOverride: '',
      userBrlCost: '',
    }
  }

  return {
    timeUtc: editRow.timeUtc,
    journalType: editRow.journalType,
    exchangeName: editRow.exchangeName || '',
    wallet: editRow.wallet ?? Wallet.TRADING,
    onchainWithdrawalRole: editRow.onchainWithdrawalRole ?? OnchainWithdrawalRole.DISPOSITION,
    onchainReceivedQuantity: editRow.onchainReceivedQuantity?.toString() ?? '',
    instrument: editRow.instrument,
    side: editRow.side,
    quantity: editRow.journalType === JournalType.OFFCHAIN_SALE
      ? Math.abs(editRow.transactionQuantity).toString()
      : editRow.transactionQuantity.toString(),
    cost: editRow.transactionCost.toString(),
    takerSide: editRow.takerSide,
    balanceOverride: editRow.balanceOverride?.toString() ?? '',
    userBrlCost: editRow.userBrlCost?.toString() ?? '',
  }
}

/**
 * Dialog for adding a new transaction row or editing an existing one.
 * Wraps AddRowDialogContent with a key to reset state when switching between add/edit.
 */
export function AddRowDialog({ open, onClose, editRow }: AddRowDialogProps) {
  if (!open) return null

  return (
    <AddRowDialogContent
      key={editRow ? `edit-${editRow.order}` : 'add'}
      open={open}
      onClose={onClose}
      editRow={editRow}
    />
  )
}

/**
 * Renders the add/edit transaction form and persists its values.
 * @param props - Dialog state, close callback, and optional row being edited
 * @returns Add/edit row dialog content
 */
function AddRowDialogContent({ open, onClose, editRow }: AddRowDialogProps) {
  const addManualRow = useAppStore(s => s.addManualRow)
  const updateRow = useAppStore(s => s.updateRow)
  const rawTransactions = useAppStore(s => s.rawTransactions)
  const initialState = createInitialFormState(editRow)

  const [timeUtc, setTimeUtc] = useState(initialState.timeUtc)
  const [journalType, setJournalType] = useState<JournalType>(initialState.journalType)
  const [exchangeName, setExchangeName] = useState(initialState.exchangeName)
  const [wallet, setWallet] = useState<Wallet>(initialState.wallet)
  const [onchainWithdrawalRole, setOnchainWithdrawalRole] = useState<OnchainWithdrawalRole>(initialState.onchainWithdrawalRole)
  const [onchainReceivedQuantity, setOnchainReceivedQuantity] = useState(initialState.onchainReceivedQuantity)
  const [instrument, setInstrument] = useState(initialState.instrument)
  const [side, setSide] = useState<TradeSide>(initialState.side)
  const [quantity, setQuantity] = useState(initialState.quantity)
  const [cost, setCost] = useState(initialState.cost)
  const [takerSide, setTakerSide] = useState(initialState.takerSide)
  const [balanceOverride, setBalanceOverride] = useState(initialState.balanceOverride)
  const [userBrlCost, setUserBrlCost] = useState(initialState.userBrlCost)
  const [pendingNewExchange, setPendingNewExchange] = useState<string | null>(null)
  const knownExchanges = useExchangeList()
  const knownInstruments = useInstrumentList()

  const isEdit = !!editRow
  const dateValid = isValidDate(timeUtc)
  const manualUpdate = isManualUpdate(journalType)
  const manualAdjustment = isManualAdjustment(journalType)
  const offchainSale = isOffchainSale(journalType)
  const offchainWithdrawal = isOffchainWithdrawal(journalType)
  const onchainWithdrawal = isOnchainWithdrawal(journalType)
  const onchainTransfer = onchainWithdrawal && onchainWithdrawalRole === OnchainWithdrawalRole.TRANSFER
  const quantityNumber = parseFloat(quantity)
  const onchainReceivedQuantityNumber = parseFloat(onchainReceivedQuantity)
  const balanceOverrideNumber = parseFloat(balanceOverride)
  const balanceOverrideValid = !manualUpdate || (balanceOverride.trim() !== '' && !Number.isNaN(balanceOverrideNumber))
  const adjustmentQuantityValid = !manualAdjustment || (quantity.trim() !== '' && !Number.isNaN(quantityNumber) && quantityNumber !== 0)
  const onchainReceivedQuantityValid = !onchainTransfer ||
    onchainReceivedQuantity.trim() === '' ||
    (!Number.isNaN(onchainReceivedQuantityNumber) && onchainReceivedQuantityNumber >= 0)
  const userBrlCostNumber = parseFloat(userBrlCost)

  /**
   * Saves the add/edit form into the transaction store.
   * @param allowNewExchange - Whether a new exchange name has already been confirmed
   */
  function handleSave(allowNewExchange = false) {
    const normalized = normalizeTo24h(timeUtc)
    const normalizedExchange = exchangeName.trim()
    const nextWallet = offchainSale ? Wallet.EXTERNAL : manualUpdate || offchainWithdrawal || onchainWithdrawal ? Wallet.TRADING : wallet
    const nextOnchainWithdrawalRole = onchainWithdrawal ? onchainWithdrawalRole : undefined
    const nextOnchainReceivedQuantity = onchainTransfer && onchainReceivedQuantity.trim() !== '' && !Number.isNaN(onchainReceivedQuantityNumber)
      ? onchainReceivedQuantityNumber
      : undefined
    const nextBalanceOverride = manualUpdate ? balanceOverrideNumber : manualAdjustment ? undefined : editRow?.balanceOverride
    const nextQuantity = offchainSale
      ? -Math.abs(parseFloat(quantity) || 0)
      : parseFloat(quantity) || 0
    const canStoreUserBrlCost = offchainSale || manualAdjustment
    const nextUserBrlCost = canStoreUserBrlCost && userBrlCost.trim() !== '' && !Number.isNaN(userBrlCostNumber)
      ? userBrlCostNumber
      : undefined

    if (normalizedExchange && !knownExchanges.includes(normalizedExchange) && !allowNewExchange) {
      setPendingNewExchange(normalizedExchange)
      return
    }

    if (isEdit) {
      updateRow(editRow!.order, {
        timeUtc: normalized,
        eventDate: parseCryptoComDate(normalized),
        journalType,
        exchangeName: normalizedExchange || undefined,
        wallet: nextWallet,
        onchainWithdrawalRole: nextOnchainWithdrawalRole,
        onchainReceivedQuantity: nextOnchainReceivedQuantity,
        instrument: normalizeInstrumentInput(instrument),
        takerSide: manualUpdate || manualAdjustment || offchainSale ? '' : takerSide.trim(),
        side: manualUpdate || manualAdjustment || offchainSale ? null : side,
        transactionQuantity: manualUpdate ? 0 : nextQuantity,
        transactionCost: manualUpdate || offchainSale ? 0 : manualAdjustment ? nextQuantity : parseFloat(cost) || 0,
        balanceOverride: nextBalanceOverride,
        userBrlCost: canStoreUserBrlCost
          ? nextUserBrlCost
          : editRow?.journalType === JournalType.OFFCHAIN_SALE || editRow?.journalType === JournalType.MANUAL_ADJUSTMENT
            ? undefined
            : editRow?.userBrlCost,
      })
    } else {
      const maxOrder = rawTransactions.reduce((max, r) => Math.max(max, r.order), 0)
      const row: CryptoComRow = {
        order: maxOrder + 1,
        journalId: '',
        timeUtc: normalized,
        eventDate: parseCryptoComDate(normalized),
        journalType,
        exchangeName: normalizedExchange || undefined,
        wallet: nextWallet,
        onchainWithdrawalRole: nextOnchainWithdrawalRole,
        onchainReceivedQuantity: nextOnchainReceivedQuantity,
        instrument: normalizeInstrumentInput(instrument),
        takerSide: manualUpdate || manualAdjustment || offchainSale ? '' : takerSide.trim(),
        side: manualUpdate || manualAdjustment || offchainSale ? null : side,
        transactionQuantity: manualUpdate ? 0 : nextQuantity,
        transactionCost: manualUpdate || offchainSale ? 0 : manualAdjustment ? nextQuantity : parseFloat(cost) || 0,
        usdBalance: 0,
        realizedPnl: 0,
        orderId: '',
        tradeId: '',
        tradeMatchId: '',
        clientOrderId: '',
        balanceOverride: manualUpdate ? balanceOverrideNumber : undefined,
        userBrlCost: canStoreUserBrlCost ? nextUserBrlCost : undefined,
      }
      addManualRow(row)
    }
    setPendingNewExchange(null)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text-primary">{isEdit ? 'Edit Row' : 'Add Row'}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-secondary">Time (UTC) — MM/DD/YYYY HH:MM:SS or HH:MM:SS AM/PM</span>
            <input
              type="text"
              value={timeUtc}
              onChange={e => setTimeUtc(e.target.value)}
              className={`bg-surface-2 border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none ${
                timeUtc && !dateValid ? 'border-danger focus:border-danger' : 'border-border focus:border-accent/50'
              }`}
            />
            {timeUtc && !dateValid && (
              <span className="text-[10px] text-danger">Invalid date</span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-secondary">Exchange</span>
            <input
              type="text"
              list="exchange-options"
              value={exchangeName}
              onChange={e => setExchangeName(e.target.value)}
              placeholder="Crypto.com, Binance..."
              className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50 placeholder:text-text-muted"
            />
            <datalist id="exchange-options">
              {knownExchanges.map(exchange => (
                <option key={exchange} value={exchange} />
              ))}
            </datalist>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Journal Type</span>
              <select
                value={journalType}
                onChange={e => {
                  const nextJournalType = e.target.value as JournalType
                  setJournalType(nextJournalType)
                  if (isManualUpdate(nextJournalType)) {
                    setWallet(Wallet.TRADING)
                    setSide(null)
                    setQuantity('')
                    setCost('')
                    setTakerSide('')
                  }
                  if (isManualAdjustment(nextJournalType)) {
                    setSide(null)
                    setCost('')
                    setTakerSide('')
                  }
                  if (isOffchainSale(nextJournalType)) {
                    setWallet(Wallet.EXTERNAL)
                    setSide(null)
                    setCost('')
                    setTakerSide('')
                  }
                  if (isOffchainWithdrawal(nextJournalType)) {
                    setWallet(Wallet.TRADING)
                  }
                  if (isOnchainWithdrawal(nextJournalType)) {
                    setWallet(Wallet.TRADING)
                    setOnchainWithdrawalRole(OnchainWithdrawalRole.DISPOSITION)
                    setOnchainReceivedQuantity('')
                  }
                }}
                className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50"
              >
                {journalTypes.map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Wallet</span>
              <select
                value={offchainSale ? Wallet.EXTERNAL : manualUpdate || offchainWithdrawal || onchainWithdrawal ? Wallet.TRADING : wallet}
                onChange={e => setWallet(e.target.value as Wallet)}
                disabled={offchainSale || manualUpdate || offchainWithdrawal || onchainWithdrawal}
                className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50 disabled:opacity-60"
              >
                {walletOptions.map(option => (
                  <option key={option} value={option}>{formatWallet(option)}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-text-secondary">Instrument</span>
            <input
              type="text"
              list="instrument-options"
              value={instrument}
              onChange={e => setInstrument(e.target.value)}
              placeholder="BTC, SOL, USD..."
              className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50 placeholder:text-text-muted"
            />
            <datalist id="instrument-options">
              {knownInstruments.map(instrumentOption => (
                <option key={instrumentOption} value={instrumentOption} />
              ))}
            </datalist>
          </label>

          {manualUpdate ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Exchange Balance</span>
              <input
                type="text"
                value={balanceOverride}
                onChange={e => setBalanceOverride(e.target.value)}
                placeholder="0.00"
                className={`bg-surface-2 border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none placeholder:text-text-muted ${
                  !balanceOverrideValid ? 'border-danger focus:border-danger' : 'border-border focus:border-accent/50'
                }`}
              />
              {!balanceOverrideValid && (
                <span className="text-[10px] text-danger">Enter the balance shown on the exchange</span>
              )}
            </label>
          ) : offchainSale ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary">Quantity Sold</span>
                <input
                  type="text"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="0.00"
                  className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50 placeholder:text-text-muted"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary">BRL Sale Proceeds</span>
                <input
                  type="text"
                  value={userBrlCost}
                  onChange={e => setUserBrlCost(e.target.value)}
                  placeholder="0.00"
                  className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50 placeholder:text-text-muted"
                />
              </label>
            </div>
          ) : manualAdjustment ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-text-secondary">Signed Quantity</span>
                <input
                  type="text"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="0.00"
                  className={`bg-surface-2 border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none placeholder:text-text-muted ${
                    !adjustmentQuantityValid ? 'border-danger focus:border-danger' : 'border-border focus:border-accent/50'
                  }`}
                />
                {!adjustmentQuantityValid && (
                  <span className="text-[10px] text-danger">Enter a non-zero signed quantity</span>
                )}
              </label>

              <label className="flex flex-col gap-1">
                <span className="flex items-center gap-1 text-xs text-text-secondary">
                  BRL Cost Basis Amount
                  <span className="group relative inline-flex">
                    <Info
                      size={13}
                      className="text-text-muted"
                      aria-label="Manual adjustment BRL cost basis help"
                    />
                    <span className="pointer-events-none absolute left-1/2 top-5 z-[70] hidden w-72 -translate-x-1/2 rounded border border-border bg-surface-1 px-2.5 py-2 text-left text-[11px] leading-4 text-text-secondary shadow-lg group-hover:block">
                      <span className="block">Positive quantity: enter acquisition cost, or 0 for zero-cost dust.</span>
                      <span className="mt-1 block">Negative quantity blank: removes proportional cost basis.</span>
                      <span className="block">Negative quantity 0: changes balance only.</span>
                      <span className="block">Negative quantity positive amount: removes exactly that BRL amount.</span>
                      <span className="mt-1 block">Manual adjustments do not create profit/loss.</span>
                    </span>
                  </span>
                </span>
                <input
                  type="text"
                  value={userBrlCost}
                  onChange={e => setUserBrlCost(e.target.value)}
                  placeholder="0.00"
                  className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50 placeholder:text-text-muted"
                />
              </label>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-text-secondary">Side</span>
                  <select
                    value={side || ''}
                    onChange={e => setSide(e.target.value as TradeSide || null)}
                    className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50"
                  >
                    <option value="">None</option>
                    <option value="BUY">BUY</option>
                    <option value="SELL">SELL</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-text-secondary">Taker Side</span>
                  <input
                    type="text"
                    value={takerSide}
                    onChange={e => setTakerSide(e.target.value)}
                    placeholder="TAKER, MAKER..."
                    className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50 placeholder:text-text-muted"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-text-secondary">Transaction Quantity</span>
                  <input
                    type="text"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    placeholder="0.00"
                    className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50 placeholder:text-text-muted"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-text-secondary">Transaction Cost</span>
                  <input
                    type="text"
                    value={cost}
                    onChange={e => setCost(e.target.value)}
                    placeholder="0.00"
                    className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50 placeholder:text-text-muted"
                  />
                </label>
              </div>
            </>
          )}

          {onchainWithdrawal && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Withdrawal Role</span>
              <select
                value={onchainWithdrawalRole}
                onChange={e => {
                  const nextRole = e.target.value as OnchainWithdrawalRole
                  setOnchainWithdrawalRole(nextRole)
                  if (nextRole !== OnchainWithdrawalRole.TRANSFER) setOnchainReceivedQuantity('')
                }}
                className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none focus:border-accent/50"
              >
                {onchainWithdrawalRoles.map(role => (
                  <option key={role} value={role}>{formatOnchainWithdrawalRole(role)}</option>
                ))}
              </select>
            </label>
          )}

          {onchainTransfer && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Amount Received</span>
              <input
                type="text"
                value={onchainReceivedQuantity}
                onChange={e => setOnchainReceivedQuantity(e.target.value)}
                placeholder="Leave blank if same as transferred"
                className={`bg-surface-2 border rounded px-2.5 py-1.5 text-xs text-text-primary outline-none placeholder:text-text-muted ${
                  !onchainReceivedQuantityValid ? 'border-danger focus:border-danger' : 'border-border focus:border-accent/50'
                }`}
              />
              {!onchainReceivedQuantityValid ? (
                <span className="text-xs text-danger">Enter a non-negative amount received</span>
              ) : (
                <span className="text-xs text-text-muted">
                  Check whether a network fee was charged and enter the amount that actually arrived.
                </span>
              )}
            </label>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className={dialogCancelClass}
          >
            Cancel
          </button>
          <button
            onClick={() => handleSave()}
            disabled={!instrument.trim() || !dateValid || !balanceOverrideValid || !adjustmentQuantityValid || !onchainReceivedQuantityValid}
            className={dialogPrimaryClass}
          >
            {isEdit ? 'Save' : 'Add'}
          </button>
        </DialogFooter>

      {pendingNewExchange && (
        <Dialog open={!!pendingNewExchange} onClose={() => setPendingNewExchange(null)} title="Create Exchange" zIndex="z-[60]">
          <p className="text-xs text-text-secondary mb-4">
            Create new exchange "{pendingNewExchange}"?
          </p>
          <DialogFooter>
            <button
              onClick={() => setPendingNewExchange(null)}
              className={dialogCancelClass}
            >
              Cancel
            </button>
            <button
              onClick={() => handleSave(true)}
              className={dialogPrimaryClass}
            >
              Create
            </button>
          </DialogFooter>
        </Dialog>
      )}
    </Dialog>
  )
}
