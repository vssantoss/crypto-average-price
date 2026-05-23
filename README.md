# Crypto Average Price

Crypto Average Price is, for now, a local React app for importing Crypto.com transaction reports, applying Brazilian PTAX exchange rates, calculating running balances, average acquisition prices, and profit/loss, then exporting the processed result as CSV.

The app is designed for local use with personal financial data. Imported files are processed in the browser and session data is saved in browser local storage.

## Disclaimer

This software is provided as is for personal recordkeeping and calculation assistance. It is not tax, legal, accounting, or financial advice, and it is not guaranteed to comply with the official tax rules, reporting requirements, or calculation methods of any country or jurisdiction. Review all results carefully and consult a qualified professional before using them for tax filings or official reporting.

## Project Status

This app is a work in progress and is not even an alpha release. It may contain incomplete features, incorrect calculations, missing edge-case handling, or behavior that changes without notice. Do not rely on it as an authoritative source until you have independently verified the results.

## Features

- Import one or more Crypto.com transaction report CSV files.
- Detect duplicate imported transactions and choose whether to skip or include them.
- Import Banco Central do Brasil PTAX CSV files for USD/BRL rates.
- Merge USD-like stablecoin rows when calculating balances.
- Track external-wallet transfers with External Balance and manual OFFCHAIN SALE rows.
- Filter by coin, hide/show table columns, and edit manual overrides.
- Add, edit, or delete transaction rows.
- Export the current view or all processed rows to CSV.
- Keep an exported CSV updated in browsers that support file-system access.
- Re-import a previous app export as a backup.

## Project Structure

```text
.
+-- crypto-average-price/     # React, TypeScript, Vite app
|   +-- src/                  # Application source code
|   +-- public/               # Static assets
|   +-- package.json          # App scripts and dependencies
|   +-- pnpm-lock.yaml        # Locked dependency versions
+-- scripts/                  # Shared local automation scripts
+-- start.bat                 # Windows dev-server shortcut
+-- start.sh                  # Shell dev-server shortcut
+-- docs/                     # Project notes and planning docs
```

## Prerequisites

- Node.js 20.19.0 or newer in the 20.x line, or Node.js 22.12.0 or newer.
- pnpm 11.1.3.

The start scripts check these requirements before starting the app. If Node.js or pnpm is missing or incompatible, the script prints step-by-step install instructions.

## Setup

From a fresh clone, use the start script for your operating system. It checks the runtime, installs dependencies with `pnpm install --frozen-lockfile`, and starts the local dev server.

## Development

From the workspace root, start the Vite dev server:

```sh
pnpm start
```

You can also use:

```sh
./start.sh
```

On Windows, run:

```bat
start.bat
```

If you already have the correct dependencies installed and want to run the app directly:

```sh
cd crypto-average-price
pnpm dev
```

## Build and Checks

Run the production build:

```sh
cd crypto-average-price
pnpm build
```

Run linting:

```sh
cd crypto-average-price
pnpm lint
```

## Input Files

Transaction imports expect Crypto.com transaction report CSV files with columns such as `Order`, `Journal ID`, `Time (UTC)`, `Event Date`, `Journal Type`, `Instrument`, `Side`, `Transaction Quantity`, and `Transaction Cost`.

PTAX imports expect Banco Central do Brasil semicolon-delimited CSV files containing USD rows and the sell rate column.

## Data Privacy

The root `.gitignore` excludes CSV and spreadsheet files by default because they usually contain personal transaction data or generated exports. If you need committed sample data, place sanitized fixtures in a clearly named folder and force-add them intentionally.
