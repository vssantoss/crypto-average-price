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
  OFFCHAIN_SALE: 'OFFCHAIN_SALE',
  ONCHAIN_WITHDRAWAL: 'ONCHAIN_WITHDRAWAL',
  CRYPTO_DUSTING: 'CRYPTO_DUSTING',
  MANUAL_UPDATE: 'MANUAL_UPDATE',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
} as const

export type JournalType = (typeof JournalType)[keyof typeof JournalType]

/**
 * Wallet buckets used by manual rows to decide which balance changes.
 */
export const Wallet = {
  TRADING: 'TRADING',
  EXTERNAL: 'EXTERNAL',
} as const

export type Wallet = (typeof Wallet)[keyof typeof Wallet]

/**
 * Derived offchain deposit split roles used for display and calculation rows.
 */
export const OffchainSplitType = {
  RETURN: 'return',
  ACQUISITION: 'acquisition',
} as const

export type OffchainSplitType = (typeof OffchainSplitType)[keyof typeof OffchainSplitType]

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
  /** User-facing asset name derived from all asset groups */
  asset?: string
  /** Internal calculation bucket derived from enabled asset groups */
  calculationAsset?: string
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
  /** Wallet bucket affected by this transaction */
  wallet?: Wallet
  /** User-provided BRL transaction amount override */
  userBrlCost?: number
  /** User-provided USD transaction amount override */
  userUsdCost?: number
  /** User-provided avg price seed */
  avgPriceSeed?: number
  /** User-provided USD avg price seed */
  usdAvgPriceSeed?: number
  /** User-provided running balance override */
  balanceOverride?: number
  /** User-provided note */
  info?: string
  /** Original row order when this is a derived calculation/display row */
  sourceOrder?: number
  /** Role of a derived OFFCHAIN_DEPOSIT split row */
  offchainSplitType?: OffchainSplitType
}

/**
 * A fully processed row ready for display in the datatable.
 * Contains all original fields plus computed BRL columns.
 */
export interface ProcessedRow {
  id: string
  order: number
  sourceOrder: number
  timeUtc: string
  eventDate: string
  journalType: JournalType
  instrument: string
  asset: string
  originalInstrument: string
  exchangeName: string
  sourceFileName: string
  wallet: Wallet
  takerSide: string
  side: TradeSide
  transactionQuantity: number
  tradeFeeQuantity: number
  netTransactionQuantity: number
  transactionCost: number
  runningBalance: number
  offchainBalance: number
  cambioBC: number | null
  brlRunningBalance: number | null
  brlTransactionCost: number | null
  usdRunningBalance: number | null
  usdTransactionCost: number | null
  usdAveragePrice: number | null
  brlCostRate: number | null
  precoMedioCompra: number | null
  totalLucroPrejuizo: number | null
  info: string
  suppressCalculatedFields: boolean
  isTradeLinked: boolean
  isLinkedTradeFee: boolean
  tradeGroupId: string
  tradeGroupSource: 'id' | 'inferred' | null
  tradeLinkSummary: string
  linkedFeeAmount: number | null
  linkedFeeInstrument: string
  offchainSplitType: OffchainSplitType | null
  hasPtaxWarning: boolean
  hasBalanceOverride: boolean
  isEditable: {
    brlCost: boolean
    usdCost: boolean
    avgPrice: boolean
    usdAvgPrice: boolean
    info: boolean
  }
}
