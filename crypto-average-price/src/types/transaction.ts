/**
 * All known journal types from the Crypto.com transaction report.
 */
export const JournalType = {
  TRADING: 'TRADING',
  TRADE_FEE: 'TRADE_FEE',
  SOFT_STAKE_REWARD: 'SOFT_STAKE_REWARD',
  OFFCHAIN_DEPOSIT: 'OFFCHAIN_DEPOSIT',
  ONCHAIN_DEPOSIT: 'ONCHAIN_DEPOSIT',
  OFFCHAIN_WITHDRAWAL: 'OFFCHAIN_WITHDRAWAL',
  ONCHAIN_WITHDRAWAL: 'ONCHAIN_WITHDRAWAL',
  CRYPTO_DUSTING: 'CRYPTO_DUSTING',
} as const

export type JournalType = (typeof JournalType)[keyof typeof JournalType]

/**
 * Possible trade sides from the Crypto.com report.
 */
export type TradeSide = 'BUY' | 'SELL' | null

/**
 * A single row parsed from the Crypto.com transaction CSV.
 * Represents one transaction or event.
 */
export interface CryptoComRow {
  order: number
  journalId: string
  timeUtc: string
  eventDate: string
  journalType: JournalType
  instrument: string
  takerSide: string
  side: TradeSide
  transactionQuantity: number
  transactionCost: number
  usdBalance: number
  realizedPnl: number
  orderId: string
  tradeId: string
  tradeMatchId: string
  clientOrderId: string
  /** Exchange associated with this transaction */
  exchangeName?: string
  /** Original imported transaction filename */
  sourceFileName?: string
  /** User-provided BRL transaction amount override */
  userBrlCost?: number
  /** User-provided avg price seed */
  avgPriceSeed?: number
  /** User-provided running balance override */
  balanceOverride?: number
  /** User-provided note */
  info?: string
}

/**
 * A fully processed row ready for display in the datatable.
 * Contains all original fields plus computed BRL columns.
 */
export interface ProcessedRow {
  id: string
  order: number
  timeUtc: string
  eventDate: string
  journalType: JournalType
  instrument: string
  originalInstrument: string
  exchangeName: string
  sourceFileName: string
  takerSide: string
  side: TradeSide
  transactionQuantity: number
  transactionCost: number
  runningBalance: number
  cambioBC: number | null
  brlRunningBalance: number | null
  brlTransactionCost: number | null
  precoMedioCompra: number | null
  totalLucroPrejuizo: number | null
  info: string
  isTradeLinked: boolean
  isLinkedTradeFee: boolean
  tradeGroupId: string
  tradeGroupSource: 'id' | 'inferred' | null
  tradeLinkSummary: string
  linkedFeeAmount: number | null
  linkedFeeInstrument: string
  hasPtaxWarning: boolean
  hasBalanceOverride: boolean
  isEditable: {
    brlCost: boolean
    avgPrice: boolean
    info: boolean
  }
}
