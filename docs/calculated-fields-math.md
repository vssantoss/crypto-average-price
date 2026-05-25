# Calculated Fields Math

This document explains the math behind the fields the app calculates from imported transactions.

The calculations are done per instrument. If the `Merge USD` option is enabled, USD-like instruments such as `USD`, `USDC`, `USDT`, and `USD_Stable_Coin` are treated as one instrument named `USD (merged)`.

Table filters only change which rows are displayed. Calculations always use the full imported dataset. Within that dataset, running balance and cost basis are calculated per instrument, while linked trade pairs may be detected across instruments before those per-instrument calculations run.

## Disclaimer

This software is provided as is for personal recordkeeping and calculation assistance. It is not tax, legal, accounting, or financial advice, and it is not guaranteed to comply with the official tax rules, reporting requirements, or calculation methods of any country or jurisdiction. Review all results carefully and consult a qualified professional before using them for tax filings or official reporting.

## Terms Used Below

- `quantity` means the row's `Tx Quantity`.
- `abs(quantity)` means the positive version of `quantity`.
- `wallet` means where the row affects quantity: `Trading Wallet` or `External Wallet`.
- `running balance` means the amount still held in the `Trading Wallet`.
- `external balance` means the amount held in the `External Wallet`.
- `total holdings` means `Running Balance + External Balance`.
- `balance before row` means total holdings immediately before the current row when used for cost-basis math.
- `balance after row` means total holdings after the current row when used for cost-basis math.
- `BRL invested` means the total cost basis still assigned to the current holdings after the row.
- `avg price` means `BRL invested / total holdings`.
- `PTAX` means the imported Banco Central do Brasil USD/BRL sell rate for the row date, or the most recent previous rate found within the lookup window.
- `Trade Fee` means the positive quantity from linked `TRADE_FEE` rows when the fee uses the same instrument as the trading row.
- `Net Tx Quantity` means `Tx Quantity - Trade Fee`.

## Running Balance

Displayed as: `Running Balance`

The running balance is the amount of the instrument held in the `Trading Wallet` after each row.

Without a manual balance override:

```text
running balance after row = previous running balance + row quantity
```

The first row starts from zero:

```text
first running balance = 0 + first row quantity
```

If a row has a manual `Running Balance` override, that override becomes an anchor. The app calculates forward from the override:

```text
next running balance = override balance + next row quantity
```

It also calculates backward before the first override:

```text
previous running balance = current running balance - current row quantity
```

Plain English: the app adds every incoming `Trading Wallet` amount and subtracts every outgoing `Trading Wallet` amount. If you manually tell the app the balance at one row, it uses that row as the known truth and fills the balances around it.

`External Wallet` rows and `OFFCHAIN_SALE` rows do not change `Running Balance`.

## External Balance

Displayed as: `External Balance`

The external balance is the amount held outside the `Trading Wallet`. This can come from an `OFFCHAIN_WITHDRAWAL` transfer, an `ONCHAIN_WITHDRAWAL` marked as `Transfer`, or from a manually added row whose wallet is `External Wallet`.

```text
External Wallet row: External Balance changes by Tx Quantity
OFFCHAIN_WITHDRAWAL: External Balance increases by abs(Tx Quantity)
ONCHAIN_WITHDRAWAL marked Transfer: External Balance increases by abs(Tx Quantity)
OFFCHAIN_DEPOSIT return portion: External Balance decreases by returned quantity
OFFCHAIN_SALE: External Balance decreases by abs(Tx Quantity)
```

Plain English: an `OFFCHAIN_WITHDRAWAL` is a transfer, not a sale. An `ONCHAIN_WITHDRAWAL` is only a transfer when its role is set to `Transfer`; otherwise it keeps the role-specific behavior shown in the table. If a later `OFFCHAIN_DEPOSIT` is covered by existing External Balance, that covered portion is a return transfer back to the Trading Wallet, not a new acquisition. A manual `External Wallet` reward increases external holdings directly. The later manual `OFFCHAIN_SALE` row is the sale event that removes total holdings and can realize profit/loss.

### Manual Update Row

A `MANUAL_UPDATE` row is a non-transaction row for anchoring information on a date. When it is used to enter the balance shown on an exchange, the row has zero transaction quantity and stores that exchange balance as a manual `Running Balance` override.

This means the row does not add or remove units by itself. It only tells the app: "at this point in time, the balance for this instrument should be this value."

### Manual Adjustment Row

A `MANUAL_ADJUSTMENT` row is a signed balance correction. It changes the selected wallet by `Tx Quantity` instead of forcing the balance to an exact value.

```text
Trading Wallet MANUAL_ADJUSTMENT: Running Balance changes by Tx Quantity
External Wallet MANUAL_ADJUSTMENT: External Balance changes by Tx Quantity
```

If the adjustment quantity is positive, it is treated as an acquisition and can use manually entered `BRL Tx Cost` / `USD Tx Cost`. Enter `0` cost for a zero-cost dust or reward correction.

If the adjustment quantity is negative, the manual BRL amount controls cost-basis movement:

```text
blank BRL Tx Cost: remove proportional cost basis
0 BRL Tx Cost: balance-only correction, leave cost basis unchanged
positive BRL Tx Cost: remove exactly that BRL amount of cost basis
```

## PTAX Rate

Displayed as: `PTAX Rate`

The PTAX rate is looked up by `Event Date`.

```text
PTAX Rate = imported PTAX sell rate for Event Date
```

If no rate exists for the exact date, the app walks backward one day at a time and uses the most recent previous imported rate found within 10 days.

```text
PTAX Rate = most recent previous imported PTAX rate, up to 10 days back
```

If no rate is found, the field is blank.

## BRL Tx Cost

Displayed as: `BRL Tx Cost`

This field means "the BRL amount attached to this row." For buys and deposits, it is acquisition cost. For sells, `ONCHAIN_WITHDRAWAL` rows marked `Disposition`, and offchain sales, it is sale proceeds.

When a trading row has a linked same-instrument fee, PTAX-based trade math uses `Net Tx Quantity` instead of raw `Tx Quantity`.

### Manual Value

When a row allows editing and the user enters a BRL amount, that manual amount wins:

```text
BRL Tx Cost = manually entered BRL amount
```

Rows that can use a manual BRL amount are:

- deposits
- `ONCHAIN_WITHDRAWAL` rows marked `Disposition`
- offchain sales
- trading `BUY` rows
- trading `SELL` rows
- positive manual adjustments

USD-to-USD trades inside the merged `USD (merged)` instrument are ignored because they do not change the economic USD position.

### Stablecoin Bought With Crypto

When a USD-like asset is bought by selling a non-USD crypto, and the app can link both trade legs:

```text
BRL Tx Cost = abs(Net Tx Quantity for the USD-like buy row) * PTAX Rate
```

Example:

```text
Buy 100 USDC with BTC, linked trade fee = 1 USDC, PTAX = 5.20
BRL Tx Cost = 99 * 5.20 = R$ 514.80
```

### Crypto Bought With Stablecoin

When a non-USD crypto is bought by selling a USD-like asset, and the app can link both trade legs:

```text
BRL Tx Cost = abs(Net Tx Quantity for the USD-like sell row) * PTAX Rate
```

Example:

```text
Buy SOL with 145 USDC, PTAX = 5.1412
BRL Tx Cost = 145 * 5.1412 = R$ 745.474
```

The USD-like sell row separately realizes profit/loss against its BRL average cost before the trade.

### USD-Like Sale Or Onchain Withdrawal Disposition

For a USD-like `SELL` row or `ONCHAIN_WITHDRAWAL` marked `Disposition`:

```text
BRL Tx Cost = USD amount sold or withdrawn, after same-instrument trade fee, * PTAX Rate
```

The USD amount is:

```text
abs(Net Tx Quantity), if Net Tx Quantity is not zero
otherwise abs(Tx Cost)
```

### Non-USD Crypto Sold For USD

When a non-USD crypto is sold and the app can find the linked USD-like buy row:

```text
BRL Tx Cost = USD amount received * PTAX Rate
```

The USD amount received comes from the linked USD-like row's `Net Tx Quantity`.

### When It Is Blank

`BRL Tx Cost` is blank when the app does not have enough information. Common cases:

- no manual BRL amount was entered for a deposit
- no manual BRL amount was entered for an `OFFCHAIN_SALE`
- no PTAX rate is available for a PTAX-based sale value
- the app cannot link both sides of a crypto-for-USD trade
- the row is a non-USD `ONCHAIN_WITHDRAWAL` marked `Disposition` without a manual BRL amount

## BRL Balance

Displayed as: `BRL Balance`

This is the remaining BRL cost basis assigned to the current holdings after the row.

```text
BRL Balance = BRL invested after this row
```

The app updates `BRL invested` differently depending on the row type.

### Buy Or Deposit

If the row adds holdings and has a known BRL cost:

```text
BRL invested after row = BRL invested before row + BRL Tx Cost
```

If the row is a `BUY`, acquisition deposit, or positive manual adjustment but does not have a known BRL cost, the app cannot continue a reliable cost basis from that point until it finds a new usable starting point, such as a manual average price seed.

### Sell, Offchain Sale, Onchain Withdrawal Disposition, Fee, Or Dust

For rows that remove holdings, the app removes cost basis at the current average price:

```text
average price before row = BRL invested before row / balance before row
cost basis removed = average price before row * abs(Net Tx Quantity)
BRL invested after row = BRL invested before row - cost basis removed
```

Plain English: selling or removing part of a coin removes the same proportion of BRL cost basis that those units carried before the row.

`OFFCHAIN_WITHDRAWAL` and `ONCHAIN_WITHDRAWAL` marked `Transfer` do not remove BRL cost basis. They only move quantity from `Running Balance` to `External Balance`, so total holdings and average price stay aligned until an `OFFCHAIN_SALE` row or another taxable disposition is created.

`ONCHAIN_WITHDRAWAL` marked `Fee` removes proportional cost basis like other fee rows, but it does not calculate BRL sale proceeds or profit/loss.

`OFFCHAIN_DEPOSIT` first consumes existing External Balance. The consumed portion is a return transfer and does not add BRL cost basis. If the deposit quantity is larger than the External Balance before the row, only the excess quantity is treated as a new acquisition and uses the manually entered BRL Tx Cost.

Negative `MANUAL_ADJUSTMENT` rows remove proportional cost basis at the current average price when BRL Tx Cost is blank. If BRL Tx Cost is manually set, the row removes exactly that BRL amount instead. Setting BRL Tx Cost to `0` makes it a balance-only correction. These rows do not calculate profit/loss.

Linked same-instrument fee rows are not counted a second time in BRL cost basis after their quantity has already been folded into the trading row's `Net Tx Quantity`.

Matched trade fee rows remain in the table and exported CSV as raw transaction rows, but their calculated fields are blank. This includes PTAX, running balance, BRL balance, BRL transaction cost, average price, profit/loss, trade fee, and net transaction quantity.

### Soft Stake Reward

Soft stake rewards increase quantity but do not add BRL cost basis:

```text
BRL invested after row = BRL invested before row
```

Because the balance increases while BRL invested stays the same, the average price can go down after a reward.

### Internal USD-To-USD Trade

When USD merging is enabled, a trade such as USDT to USDC is treated as internal movement inside `USD (merged)`. The app keeps the existing average cost basis:

```text
BRL invested added for internal USD buy = average price before row * abs(quantity)
```

This preserves the same average price instead of treating the stablecoin swap as a new external purchase.

## BRL Avg Price

Displayed as: `BRL Avg Price`

Average price is calculated from the current BRL balance and total holdings:

```text
BRL Avg Price = BRL Balance / (Running Balance + External Balance)
```

The field is blank when:

- `BRL Balance` is unknown
- total holdings are zero or negative

### Manual Average Price Seed

If the user enters a manual `BRL Avg Price` on a row, that row becomes an anchor:

```text
BRL Balance at seed row = manual BRL Avg Price * total holdings at seed row
```

The app then calculates forward from that seed using later rows.

It also calculates backward before the first seed. For rows that remove holdings, the reverse math restores the previous proportional cost basis:

```text
BRL Balance before row = BRL Balance after row * balance before row / balance after row
```

For a previous buy or deposit with known cost, the reverse math subtracts the known cost:

```text
BRL Balance before row = BRL Balance after row - BRL Tx Cost
```

Plain English: a seed tells the app, "At this row, the average price was this amount." The app uses that known point to fill the cost basis before and after it.

## BRL Profit/Loss

Displayed as: `BRL Profit/Loss`

This is only calculated on disposition rows:

- trading `SELL`
- offchain sale
- `ONCHAIN_WITHDRAWAL` marked `Disposition`

The general formula is:

```text
BRL Profit/Loss = sale proceeds in BRL - cost basis sold
```

Where:

```text
cost basis sold = BRL Avg Price * abs(quantity sold or withdrawn)
```

For linked same-instrument trading fees, `quantity sold or withdrawn` uses `Net Tx Quantity`.

### Manual Sale Proceeds

If the row has a manually entered `BRL Tx Cost`, that manual value is treated as sale proceeds:

```text
BRL Profit/Loss = manual BRL Tx Cost - (BRL Avg Price * abs(Net Tx Quantity))
```

### USD-Like Sale Or Onchain Withdrawal Disposition

For USD-like instruments:

```text
sale proceeds in BRL = abs(Net Tx Quantity) * PTAX Rate
BRL Profit/Loss = sale proceeds in BRL - (BRL Avg Price * abs(Net Tx Quantity))
```

### Non-USD Crypto Sold For USD

For non-USD crypto sold into a USD-like asset, the app uses the linked USD-like row:

```text
sale proceeds in BRL = abs(linked USD Net Tx Quantity) * PTAX Rate
BRL Profit/Loss = sale proceeds in BRL - (BRL Avg Price * abs(non-USD Net Tx Quantity sold))
```

### When It Is Blank

`BRL Profit/Loss` is blank when:

- the row is not a sell, offchain sale, or `ONCHAIN_WITHDRAWAL` marked `Disposition`
- `BRL Avg Price` is blank
- quantity is zero
- the row is an internal USD-to-USD trade
- no manual sale proceeds or PTAX-based sale proceeds can be calculated
- the row is an `OFFCHAIN_SALE` without manual BRL proceeds

## Source Files

The math above is implemented mainly in:

- `crypto-average-price/src/engine/runningBalance.ts`
- `crypto-average-price/src/engine/offchainBalance.ts`
- `crypto-average-price/src/engine/ptaxLookup.ts`
- `crypto-average-price/src/engine/computeAllColumns.ts`
- `crypto-average-price/src/engine/averagePrice.ts`
- `crypto-average-price/src/engine/profitLoss.ts`
- `crypto-average-price/src/store/selectors.ts`
