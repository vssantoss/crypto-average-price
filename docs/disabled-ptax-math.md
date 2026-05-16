# Disabled PTAX Math

This note documents where PTAX rates were previously used and what changed when PTAX-based BRL math was disabled.

## Where PTAX Was Used

PTAX was used to convert USD-denominated transaction values into BRL.

### BRL Transaction Cost

File: `src/engine/computeAllColumns.ts`

Previously:

- USD-like instruments used `transactionCost * PTAX`.
- Non-USD trading rows tried to find the paired USD trade row and used `paired.transactionCost * PTAX`.
- Manual deposit BRL cost overrode the PTAX calculation.

Now:

- PTAX conversion is disabled for acquisition cost basis.
- `BRL Tx Cost` is populated from manually entered deposit `BRL Tx Cost`.
- `BRL Tx Cost` is also populated for trading SELL rows when all sale information is available.
- For USD-like SELL rows, the app uses `abs(transactionQuantity) * PTAX`.
- For non-USD SELL rows, the app finds the paired USD row and uses `abs(paired.transactionQuantity) * PTAX`.
- If PTAX, side, trade pairing, or USD quantity is missing, `BRL Tx Cost` returns `null`.

### BRL Average Price

File: `src/engine/averagePrice.ts`

Previously:

- Trading BUY rows could add BRL cost basis using PTAX and the row or paired USD value.
- Deposit rows without manual BRL cost could derive BRL cost from `transactionQuantity * PTAX`.
- Those PTAX-derived costs could drive `BRL Avg Price` and `BRL Running Balance`.

Now:

- PTAX-derived acquisition cost is disabled.
- Trading BUY rows do not create BRL cost from PTAX.
- Trading BUY rows can use manually entered `BRL Tx Cost` as acquisition cost.
- Deposit rows only contribute BRL cost when the user manually enters `BRL Tx Cost`.
- Manual average price seeds still work.

### BRL Profit/Loss

File: `src/engine/profitLoss.ts`

Previously:

- USD-like SELL/withdrawal rows used `(PTAX - avgPrice) * quantity`.
- Non-USD SELL rows tried to derive an effective BRL sale rate from the paired USD trade value and PTAX.

Now:

- PTAX-derived profit/loss is disabled.
- `BRL Profit/Loss` returns `null`.
- PTAX is not used to create acquisition cost, BRL average price, or profit/loss.

### PTAX Warnings

Files:

- `src/engine/computeAllColumns.ts`
- `src/store/selectors.ts`

Previously:

- Rows could show a missing PTAX warning when PTAX data existed but no rate was found for the transaction date.
- The app showed PTAX-related diagnostics asking the user to import PTAX files.

Now:

- Missing PTAX row warnings are disabled.
- PTAX-related diagnostics are disabled.
- The `PTAX Rate` column can still display imported PTAX values, but those values are not used for BRL calculations.

## Current BRL Calculation Sources

With PTAX math disabled, BRL calculations can come from:

- Manually entered deposit `BRL Tx Cost`.
- Manually entered trading BUY `BRL Tx Cost`.
- Manually entered `BRL Avg Price` seed.
- PTAX-derived sale value for `BRL Tx Cost` on trading SELL rows, when all sale information exists.

PTAX imports are retained in the app for the displayed `PTAX Rate` column and for SELL-row `BRL Tx Cost` only.
