# Documentation

This folder contains project notes that explain the calculation model, historical decisions, and early AI-assisted planning for Crypto Average Price.

## Calculation References

- [Calculated Fields Math](./calculated-fields-math.md) documents the current formulas and rules for running balance, PTAX lookup, BRL transaction cost, BRL balance, average price, profit/loss, and summary panel fields.
- [Disabled PTAX Math](./disabled-ptax-math.md) documents previous PTAX-related behavior that was disabled or changed, including where PTAX was formerly used and which BRL values are currently sourced from manual or transaction data.

Use these files when changing calculation code under `crypto-average-price/src/engine`, export/import behavior, or table columns that display computed values.

## AI Interaction Archive

The [ai-interaction](./ai-interaction) folder stores early project prompts and implementation planning notes:

- [01. first prompt](./ai-interaction/01.%20first%20prompt.md) captures the original product request and spreadsheet workflow.
- [02. first plan](./ai-interaction/02.%20first%20plan) captures the initial implementation plan, proposed architecture, and feature breakdown.

These files are historical context. They can help explain why the app was built, but the current source code and calculation reference docs should take precedence when behavior differs.

## Documentation Guidelines

- Keep calculation docs close to the behavior implemented in source code.
- Add dated or historical notes when documenting removed behavior.
- Do not place personal transaction data, raw exchange exports, or generated result files in this folder.
- If sample data is needed, use sanitized fixtures and document what each fixture is meant to prove.

## Disclaimer

The documentation describes how this project currently performs calculations. It is not tax, legal, accounting, or financial advice, and it does not guarantee compliance with any country's tax rules or reporting requirements.
