# Calculated Fields Math

This document explains the math behind the fields the app calculates from imported transactions.

The calculations are done per instrument. If the `Merge USD` option is enabled, USD-like instruments such as `USD`, `USDC`, `USDT`, and `USD_Stable_Coin` are treated as one instrument named `USD (merged)`.

## Disclaimer

This software is provided as is for personal recordkeeping and calculation assistance. It is not tax, legal, accounting, or financial advice, and it is not guaranteed to comply with the official tax rules, reporting requirements, or calculation methods of any country or jurisdiction. Review all results carefully and consult a qualified professional before using them for tax filings or official reporting.

## Terms Used Below

- `quantity` means the row's `Tx Quantity`.
- `abs(quantity)` means the positive version of `quantity`.
- `balance before row` means the running balance immediately before the current row.
- `balance after row` means the running balance shown on the current row.
- `BRL invested` means the total cost basis still assigned to the current holdings after the row.
- `avg price` means `BRL invested / current balance`.
- `PTAX` means the imported Banco Central do Brasil USD/BRL sell rate for the row date, or the most recent previous rate found within the lookup window.
- `Trade Fee` means the positive quantity from linked `TRADE_FEE` rows when the fee uses the same instrument as the trading row.
- `Net Tx Quantity` means `Tx Quantity - Trade Fee`.

## Running Balance

Displayed as: `Running Balance`

The running balance is the amount of the instrument held after each row.

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

Plain English: the app adds every incoming amount and subtracts every outgoing amount. If you manually tell the app the balance at one row, it uses that row as the known truth and fills the balances around it.

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

This field means "the BRL amount attached to this row." For buys and deposits, it is acquisition cost. For sells and withdrawals, it is sale proceeds.

When a trading row has a linked same-instrument fee, PTAX-based trade math uses `Net Tx Quantity` instead of raw `Tx Quantity`.

### Manual Value

When a row allows editing and the user enters a BRL amount, that manual amount wins:

```text
BRL Tx Cost = manually entered BRL amount
```

Rows that can use a manual BRL amount are:

- deposits
- withdrawals
- trading `BUY` rows
- trading `SELL` rows

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

### USD-Like Sale Or Withdrawal

For a USD-like `SELL` row or withdrawal:

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
- no PTAX rate is available for a PTAX-based sale value
- the app cannot link both sides of a crypto-for-USD trade
- the row is a non-USD withdrawal without a manual BRL amount

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

If the row is a `BUY` or deposit but does not have a known BRL cost, the app cannot continue a reliable cost basis from that point until it finds a new usable starting point, such as a manual average price seed.

### Sell, Withdrawal, Fee, Or Dust

For rows that remove holdings, the app removes cost basis at the current average price:

```text
average price before row = BRL invested before row / balance before row
cost basis removed = average price before row * abs(Net Tx Quantity)
BRL invested after row = BRL invested before row - cost basis removed
```

Plain English: selling or removing part of a coin removes the same proportion of BRL cost basis that those units carried before the row.

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

Average price is calculated from the current BRL balance and current running balance:

```text
BRL Avg Price = BRL Balance / Running Balance
```

The field is blank when:

- `BRL Balance` is unknown
- `Running Balance` is zero or negative

### Manual Average Price Seed

If the user enters a manual `BRL Avg Price` on a row, that row becomes an anchor:

```text
BRL Balance at seed row = manual BRL Avg Price * Running Balance at seed row
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
- offchain withdrawal
- onchain withdrawal

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

### USD-Like Sale Or Withdrawal

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

- the row is not a sell or withdrawal
- `BRL Avg Price` is blank
- quantity is zero
- the row is an internal USD-to-USD trade
- no manual sale proceeds or PTAX-based sale proceeds can be calculated

## Summary Panel Fields

The summary panel uses the last calculated row for each instrument.

### Current Balance

```text
Current Balance = Running Balance on the latest row for the instrument
```

### Average Price

```text
Average Price = BRL Avg Price on the latest row for the instrument
```

### BRL Balance

```text
BRL Balance = BRL Balance on the latest row for the instrument
```

### Total BRL Invested

This field currently has no calculation and is returned as blank.

## Source Files

The math above is implemented mainly in:

- `crypto-average-price/src/engine/runningBalance.ts`
- `crypto-average-price/src/engine/ptaxLookup.ts`
- `crypto-average-price/src/engine/computeAllColumns.ts`
- `crypto-average-price/src/engine/averagePrice.ts`
- `crypto-average-price/src/engine/profitLoss.ts`
- `crypto-average-price/src/store/selectors.ts`
