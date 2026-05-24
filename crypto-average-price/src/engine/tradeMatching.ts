import type { CryptoComRow } from '../types/transaction'
import { JournalType } from '../types/transaction'

/**
 * An index mapping Trade Match IDs to their associated transaction rows.
 * Each Trade Match ID can include trade legs and related fee rows.
 */
export type TradeMatchIndex = Map<string, CryptoComRow[]>

export type TradeLinkSource = 'id' | 'inferred'

export interface TradeGroup {
  key: string
  displayId: string
  source: TradeLinkSource
  rows: CryptoComRow[]
}

export interface TradeLinkMetadata {
  isLinked: boolean
  isFee: boolean
  groupId: string
  groupSource: TradeLinkSource | null
  tradeId: string
  summary: string
  feeAmount: number | null
  feeInstrument: string
}

export interface TradeLinkIndex {
  groups: Map<string, TradeGroup>
  rowGroupByOrder: Map<number, TradeGroup>
}

/**
 * Checks whether a Crypto.com ID field can be used as a stable link key.
 * @param value - Raw ID value from a transaction row
 * @returns True when the value is non-empty and not Crypto.com's zero sentinel
 */
function hasStableId(value: string): boolean {
  const trimmed = value.trim()
  return trimmed !== '' && trimmed !== '0'
}

/**
 * Gets the fallback stable trade group ID for a row.
 * @param row - Transaction row to inspect
 * @returns Stable group key details, or null when no Crypto.com ID is present
 */
function getFallbackTradeGroupKey(row: CryptoComRow): { key: string; displayId: string } | null {
  if (hasStableId(row.tradeMatchId)) {
    return { key: `trade-match:${row.tradeMatchId}`, displayId: row.tradeMatchId }
  }

  if (hasStableId(row.clientOrderId)) {
    return { key: `client-order:${row.clientOrderId}`, displayId: row.clientOrderId }
  }

  return null
}

/**
 * Checks whether rows form one exact trade pair.
 * @param rows - Candidate grouped rows
 * @returns True when the group has one BUY and one SELL across two instruments
 */
function isExactTwoLegTrade(rows: CryptoComRow[]): boolean {
  const tradingRows = rows.filter(row => row.journalType === JournalType.TRADING && row.side !== null)
  if (tradingRows.length !== 2) return false

  const buys = tradingRows.filter(row => row.side === 'BUY')
  const sells = tradingRows.filter(row => row.side === 'SELL')
  const instruments = new Set(tradingRows.map(row => row.instrument))
  return buys.length === 1 && sells.length === 1 && instruments.size === 2
}

/**
 * Builds exact two-leg trade groups from a specific Crypto.com ID field.
 * @param rows - Transaction rows to group
 * @param field - Row field containing the grouping ID
 * @param prefix - Internal key prefix for the generated groups
 * @returns Exact trade groups keyed by the selected ID field
 */
function buildExactTradeGroupsByField(
  rows: CryptoComRow[],
  field: 'tradeId' | 'orderId',
  prefix: string,
): Map<string, TradeGroup> {
  const groupRows = new Map<string, CryptoComRow[]>()

  for (const row of rows) {
    const id = row[field]
    if (!hasStableId(id)) continue

    const existing = groupRows.get(id)
    if (existing) {
      existing.push(row)
    } else {
      groupRows.set(id, [row])
    }
  }

  const groups = new Map<string, TradeGroup>()
  for (const [id, group] of groupRows) {
    if (!isExactTwoLegTrade(group)) continue
    groups.set(`${prefix}:${id}`, createTradeGroup(`${prefix}:${id}`, id, 'id', group))
  }

  return groups
}

/**
 * Gets orders already claimed by higher-confidence trade groups.
 * @param groups - Trade groups to inspect
 * @returns Set of transaction order numbers already linked
 */
function getClaimedOrders(groups: Map<string, TradeGroup>): Set<number> {
  const orders = new Set<number>()
  for (const group of groups.values()) {
    for (const row of group.rows) {
      orders.add(row.order)
    }
  }
  return orders
}

/**
 * Converts a row into a stable-ish signature for inferred groups.
 * @param row - Transaction row to describe
 * @returns Signature built from imported facts, excluding generated order numbers
 */
function getInferenceRowSignature(row: CryptoComRow): string {
  return [
    row.exchangeName || '',
    row.timeUtc,
    row.journalType,
    row.instrument,
    row.side || '',
    row.transactionQuantity,
    row.transactionCost,
  ].join('|')
}

/**
 * Parses the app's MM/DD/YYYY HH:MM:SS timestamp format.
 * @param timeUtc - Timestamp string from a transaction row
 * @returns Milliseconds since epoch, or null when parsing fails
 */
function parseTransactionTime(timeUtc: string): number | null {
  const match = timeUtc.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!match) return null

  const [, month, day, year, hour, minute, second] = match
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )
}

/**
 * Checks whether two rows belong to the same imported exchange.
 * @param left - First transaction row
 * @param right - Second transaction row
 * @returns True when both exchange names match after trimming
 */
function hasSameExchange(left: CryptoComRow, right: CryptoComRow): boolean {
  return (left.exchangeName || '').trim() === (right.exchangeName || '').trim()
}

/**
 * Checks whether two rows are close enough in time for inferred fee linking.
 * @param left - First transaction row
 * @param right - Second transaction row
 * @returns True when timestamps are equal or within one second
 */
function isNearSameSecond(left: CryptoComRow, right: CryptoComRow): boolean {
  const leftTime = parseTransactionTime(left.timeUtc)
  const rightTime = parseTransactionTime(right.timeUtc)
  if (leftTime === null || rightTime === null) return left.timeUtc === right.timeUtc
  return Math.abs(leftTime - rightTime) <= 1000
}

/**
 * Creates a trade group object.
 * @param key - Internal group key
 * @param displayId - User-facing group ID
 * @param source - Whether the group came from IDs or inference
 * @param rows - Rows in the group
 * @returns Trade group object with rows sorted by current display order
 */
function createTradeGroup(
  key: string,
  displayId: string,
  source: TradeLinkSource,
  rows: CryptoComRow[],
): TradeGroup {
  return {
    key,
    displayId,
    source,
    rows: [...rows].sort((a, b) => a.order - b.order),
  }
}

/**
 * Checks whether a group has at least one real trading leg.
 * @param group - Trade group to inspect
 * @returns True when a group has one or more TRADING rows
 */
function hasTradingLeg(group: TradeGroup): boolean {
  return group.rows.some(row => row.journalType === JournalType.TRADING)
}

/**
 * Builds explicit trade groups from Crypto.com's stable ID fields.
 * @param rows - Transaction rows to group
 * @returns Explicit groups keyed by stable Crypto.com IDs
 */
function buildExplicitTradeGroups(rows: CryptoComRow[]): Map<string, TradeGroup> {
  const groups = buildExactTradeGroupsByField(rows, 'tradeId', 'trade')
  const claimedByTradeId = getClaimedOrders(groups)
  const orderGroups = buildExactTradeGroupsByField(
    rows.filter(row => !claimedByTradeId.has(row.order)),
    'orderId',
    'order',
  )

  for (const [key, group] of orderGroups) {
    groups.set(key, group)
  }

  const claimedOrders = getClaimedOrders(groups)
  const groupRows = new Map<string, { displayId: string; rows: CryptoComRow[] }>()

  for (const row of rows) {
    if (claimedOrders.has(row.order)) continue

    const stableKey = getFallbackTradeGroupKey(row)
    if (!stableKey) continue

    const existing = groupRows.get(stableKey.key)
    if (existing) {
      existing.rows.push(row)
    } else {
      groupRows.set(stableKey.key, { displayId: stableKey.displayId, rows: [row] })
    }
  }

  for (const [key, group] of groupRows) {
    const tradeGroup = createTradeGroup(key, group.displayId, 'id', group.rows)
    if (tradeGroup.rows.length > 1 && hasTradingLeg(tradeGroup)) {
      groups.set(key, tradeGroup)
    }
  }

  return groups
}

/**
 * Finds unambiguous two-leg trading groups for rows that do not have Crypto.com IDs.
 * @param rows - Transaction rows without stable IDs
 * @returns Inferred trading groups before fee rows are attached
 */
function buildInferredTradingGroups(rows: CryptoComRow[]): TradeGroup[] {
  const bucketRows = new Map<string, CryptoComRow[]>()

  for (const row of rows) {
    if (row.journalType !== JournalType.TRADING || row.side === null) continue

    const bucketKey = [
      (row.exchangeName || '').trim(),
      row.timeUtc,
    ].join('|')
    const bucket = bucketRows.get(bucketKey)
    if (bucket) {
      bucket.push(row)
    } else {
      bucketRows.set(bucketKey, [row])
    }
  }

  const groups: TradeGroup[] = []
  for (const bucket of bucketRows.values()) {
    const buys = bucket.filter(row => row.side === 'BUY')
    const sells = bucket.filter(row => row.side === 'SELL')

    if (bucket.length !== 2 || buys.length !== 1 || sells.length !== 1) continue
    if (buys[0].instrument === sells[0].instrument) continue

    const signatures = [getInferenceRowSignature(sells[0]), getInferenceRowSignature(buys[0])]
      .sort()
      .join('||')
    const displayId = `Inferred ${sells[0].timeUtc}`
    groups.push(createTradeGroup(`inferred:${signatures}`, displayId, 'inferred', [sells[0], buys[0]]))
  }

  return groups
}

/**
 * Checks whether a fee row can belong to an inferred trade group.
 * @param fee - Fee row to attach
 * @param group - Candidate inferred trade group
 * @returns True when exchange, time, and instrument make the group plausible
 */
function canAttachInferredFee(fee: CryptoComRow, group: TradeGroup): boolean {
  if (fee.journalType !== JournalType.TRADE_FEE) return false

  return group.rows.some(row => (
    hasSameExchange(fee, row) &&
    isNearSameSecond(fee, row) &&
    fee.instrument === row.instrument &&
    Math.abs(fee.transactionQuantity) <= Math.abs(row.transactionQuantity)
  ))
}

/**
 * Adds unambiguous inferred fee rows to inferred trading groups.
 * @param groups - Inferred trading groups
 * @param rows - Rows without stable IDs
 * @returns Inferred groups with fee rows attached when exactly one group matches
 */
function attachInferredFees(groups: TradeGroup[], rows: CryptoComRow[]): TradeGroup[] {
  const feeRows = rows.filter(row => row.journalType === JournalType.TRADE_FEE)
  const groupRows = new Map(groups.map(group => [group.key, [...group.rows]]))

  for (const fee of feeRows) {
    const candidates = groups.filter(group => canAttachInferredFee(fee, group))
    if (candidates.length !== 1) continue

    groupRows.get(candidates[0].key)?.push(fee)
  }

  return groups.map(group => createTradeGroup(
    group.key,
    group.displayId,
    group.source,
    groupRows.get(group.key) || group.rows,
  ))
}

/**
 * Builds an index of stable or carefully inferred trade groups and row membership.
 * @param rows - All transaction rows in the current dataset
 * @returns Trade link index for looking up linked trades and fees
 */
export function buildTradeLinkIndex(rows: CryptoComRow[]): TradeLinkIndex {
  const groups = buildExplicitTradeGroups(rows)
  const claimedOrders = getClaimedOrders(groups)
  const rowsWithoutIds = rows.filter(row => !claimedOrders.has(row.order) && !getFallbackTradeGroupKey(row))
  const inferredGroups = attachInferredFees(
    buildInferredTradingGroups(rowsWithoutIds),
    rowsWithoutIds,
  )

  for (const group of inferredGroups) {
    if (group.rows.length > 1 && hasTradingLeg(group)) {
      groups.set(group.key, group)
    }
  }

  const rowGroupByOrder = new Map<number, TradeGroup>()
  for (const group of groups.values()) {
    for (const row of group.rows) {
      rowGroupByOrder.set(row.order, group)
    }
  }

  return { groups, rowGroupByOrder }
}

/**
 * Finds the trade group containing a row.
 * @param row - Transaction row to look up
 * @param index - Trade link index built from all rows
 * @returns The row's linked trade group, or null when unlinked
 */
export function findTradeGroup(row: CryptoComRow, index: TradeLinkIndex): TradeGroup | null {
  return index.rowGroupByOrder.get(row.order) || null
}

/**
 * Returns the real trading rows from a group, excluding fee rows.
 * @param group - Trade group to inspect
 * @returns Trading rows sorted by current display order
 */
export function getTradingRows(group: TradeGroup): CryptoComRow[] {
  return group.rows
    .filter(row => row.journalType === JournalType.TRADING)
    .sort((a, b) => a.order - b.order)
}

/**
 * Returns the fee rows from a group.
 * @param group - Trade group to inspect
 * @returns Trade fee rows sorted by current display order
 */
export function getFeeRows(group: TradeGroup): CryptoComRow[] {
  return group.rows
    .filter(row => row.journalType === JournalType.TRADE_FEE)
    .sort((a, b) => a.order - b.order)
}

/**
 * Gets the single Crypto.com Trade ID associated with a linked group.
 * @param group - Trade group to inspect
 * @returns Trade ID when all linked trade rows share one stable ID, otherwise an empty string
 */
function getGroupTradeId(group: TradeGroup): string {
  const tradeIds = Array.from(new Set(
    group.rows
      .map(row => row.tradeId.trim())
      .filter(hasStableId),
  ))

  return tradeIds.length === 1 ? tradeIds[0] : ''
}

/**
 * Gets the original grouped row for a possibly normalized transaction row.
 * @param row - Transaction row to match by display order
 * @param group - Linked trade group containing original rows
 * @returns Original row from the group, or the input row when no match exists
 */
function getOriginalGroupedRow(row: CryptoComRow, group: TradeGroup): CryptoComRow {
  return group.rows.find(groupRow => groupRow.order === row.order) || row
}

/**
 * Gets the positive linked fee quantity that belongs to the same instrument as a trading row.
 * @param row - Trading row to inspect
 * @param index - Trade link index built from all rows
 * @returns Positive same-instrument linked fee quantity, or 0 when none applies
 */
export function getLinkedTradeFeeQuantity(row: CryptoComRow, index: TradeLinkIndex): number {
  const group = findTradeGroup(row, index)
  if (!group || row.journalType !== JournalType.TRADING) return 0

  const originalRow = getOriginalGroupedRow(row, group)
  return getFeeRows(group)
    .filter(fee => fee.instrument === originalRow.instrument)
    .reduce((sum, fee) => sum + Math.abs(fee.transactionQuantity), 0)
}

/**
 * Calculates the transaction quantity after subtracting same-instrument linked trade fees.
 * @param row - Transaction row to inspect
 * @param index - Trade link index built from all rows
 * @returns Raw transaction quantity minus the positive linked trade fee quantity
 */
export function getNetTransactionQuantity(row: CryptoComRow, index: TradeLinkIndex): number {
  return row.transactionQuantity - getLinkedTradeFeeQuantity(row, index)
}

/**
 * Checks whether a trade fee row is already represented on a linked trading row.
 * @param row - Transaction row to inspect
 * @param index - Trade link index built from all rows
 * @returns True when this is a linked fee row for a same-instrument trading row
 */
export function isFoldedTradeFeeRow(row: CryptoComRow, index: TradeLinkIndex): boolean {
  const group = findTradeGroup(row, index)
  if (!group || row.journalType !== JournalType.TRADE_FEE) return false

  const originalRow = getOriginalGroupedRow(row, group)
  return getTradingRows(group).some(tradingRow => tradingRow.instrument === originalRow.instrument)
}

/**
 * Finds the linked opposite trading leg for a row.
 * @param row - Transaction row to find a pair for
 * @param index - Trade link index built from all rows
 * @returns The opposite TRADING row, or null when no unambiguous pair exists
 */
export function findLinkedTradingPair(
  row: CryptoComRow,
  index: TradeLinkIndex,
): CryptoComRow | null {
  const group = findTradeGroup(row, index)
  if (!group || row.journalType !== JournalType.TRADING) return null

  const candidates = getTradingRows(group).filter(match => (
    match.order !== row.order &&
    match.side !== null &&
    match.side !== row.side &&
    match.instrument !== row.instrument
  ))

  if (candidates.length !== 1) return null
  return candidates[0]
}

/**
 * Formats a linked trade group into a compact table summary.
 * @param group - Trade group to summarize
 * @returns Human-readable trade summary
 */
function formatTradeSummary(group: TradeGroup): string {
  const tradingRows = getTradingRows(group)
  const sell = tradingRows.find(row => row.side === 'SELL')
  const buy = tradingRows.find(row => row.side === 'BUY')

  if (sell && buy) {
    return `${sell.instrument} SELL -> ${buy.instrument} BUY`
  }

  return tradingRows
    .map(row => `${row.instrument} ${row.side || ''}`.trim())
    .join(' / ')
}

/**
 * Gets display metadata describing how a row is linked to a trade group.
 * @param row - Transaction row to describe
 * @param index - Trade link index built from all rows
 * @returns Trade link metadata for processed table display
 */
export function getTradeLinkMetadata(
  row: CryptoComRow,
  index: TradeLinkIndex,
): TradeLinkMetadata {
  const group = findTradeGroup(row, index)
  const isFee = row.journalType === JournalType.TRADE_FEE

  if (!group) {
    return {
      isLinked: false,
      isFee,
      groupId: '',
      groupSource: null,
      tradeId: '',
      summary: '',
      feeAmount: null,
      feeInstrument: '',
    }
  }

  const feeRows = getFeeRows(group)
  const feeAmount = feeRows.length > 0
    ? feeRows.reduce((sum, fee) => sum + Math.abs(fee.transactionQuantity), 0)
    : null
  const feeInstruments = Array.from(new Set(feeRows.map(fee => fee.instrument)))

  return {
    isLinked: true,
    isFee,
    groupId: group.displayId,
    groupSource: group.source,
    tradeId: getGroupTradeId(group),
    summary: formatTradeSummary(group),
    feeAmount,
    feeInstrument: feeInstruments.length === 1 ? feeInstruments[0] : '',
  }
}

/**
 * Builds an index from Trade Match IDs to transaction rows.
 * Only includes rows that have a non-empty Trade Match ID.
 * @param rows - All parsed Crypto.com transaction rows
 * @returns A map from Trade Match ID to the rows sharing that ID
 */
export function buildTradeMatchIndex(rows: CryptoComRow[]): TradeMatchIndex {
  const index: TradeMatchIndex = new Map()

  for (const row of rows) {
    const id = row.tradeMatchId
    if (!hasStableId(id)) continue

    const existing = index.get(id)
    if (existing) {
      existing.push(row)
    } else {
      index.set(id, [row])
    }
  }

  return index
}

/**
 * Finds the paired trading row for a given row in a trade.
 * For example, if row is a BTC BUY, returns the corresponding USD_Stable_Coin SELL.
 * @param row - The transaction row to find a pair for
 * @param index - The Trade Match Index built from all rows
 * @returns The paired TRADING row with a different instrument, or null if not found
 */
export function findPairedRow(
  row: CryptoComRow,
  index: TradeMatchIndex,
): CryptoComRow | null {
  const id = row.tradeMatchId
  if (!hasStableId(id)) return null

  const matches = index.get(id)
  if (!matches) return null

  for (const match of matches) {
    if (
      match.journalType === JournalType.TRADING &&
      match.instrument !== row.instrument &&
      match.order !== row.order
    ) {
      return match
    }
  }

  return null
}
