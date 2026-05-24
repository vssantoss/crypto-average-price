#!/usr/bin/env python3
"""Compare two backup CSV files while ignoring columns that are not shared."""

from __future__ import annotations

import csv
import sys
from pathlib import Path


DEFAULT_LEFT = "2024-2025-transactions-v5.1-excel.csv"
DEFAULT_RIGHT = "2024-2025-transactions-v5.2-excel.csv"
CONTEXT_COLUMNS = ["Time (UTC)", "Journal Type", "Instrument", "Side", "Transaction Quantity"]
DISPLAY_WIDTHS = {
    "line": 6,
    "column": 24,
    "left": 34,
    "right": 34,
    "Time (UTC)": 22,
    "Journal Type": 14,
    "Instrument": 16,
    "Side": 8,
    "Transaction Quantity": 22,
}


# Reads a CSV file into headers and row dictionaries.
# path: CSV path to load.
# Returns: tuple containing the header list and all parsed rows.
def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        headers = reader.fieldnames or []
        return headers, list(reader)


# Formats a cell value for readable diff output.
# value: Raw CSV value to print.
# Returns: repr-style value with None rendered explicitly.
def format_value(value: str | None) -> str:
    if value is None:
        return "<missing>"
    return repr(value)


# Shortens a value so aligned output stays readable.
# value: Raw display value.
# width: Maximum width available for the value.
# Returns: value padded or shortened to the requested width.
def fit(value: str, width: int) -> str:
    if len(value) > width:
        value = value[: width - 3] + "..."
    return value.ljust(width)


# Returns a row's identifying transaction context.
# left_row: Row from the first CSV, if present.
# right_row: Row from the second CSV, if present.
# Returns: list of context values in CONTEXT_COLUMNS order.
def get_context(left_row: dict[str, str] | None, right_row: dict[str, str] | None) -> list[str]:
    context = []

    for column in CONTEXT_COLUMNS:
        left_value = left_row.get(column, "") if left_row else ""
        right_value = right_row.get(column, "") if right_row else ""

        # Prefer the shared value, but show both when the context itself differs.
        if left_value == right_value:
            context.append(left_value)
        elif left_value and right_value:
            context.append(f"{left_value} != {right_value}")
        else:
            context.append(left_value or right_value)

    return context


# Prints the aligned diff table header.
# left_name: Display name for the first CSV value column.
# right_name: Display name for the second CSV value column.
# Returns: None.
def print_diff_header(left_name: str, right_name: str) -> None:
    header_parts = [
        fit("Line", DISPLAY_WIDTHS["line"]),
        fit("Column", DISPLAY_WIDTHS["column"]),
        fit(left_name, DISPLAY_WIDTHS["left"]),
        fit(right_name, DISPLAY_WIDTHS["right"]),
    ]

    for column in CONTEXT_COLUMNS:
        header_parts.append(fit(column, DISPLAY_WIDTHS[column]))

    print("  ".join(header_parts))
    print("  ".join("-" * len(part) for part in header_parts))


# Prints one aligned difference row with transaction context.
# row_number: CSV line number for the row.
# header: Column name that differs.
# left_value: Value from the first CSV.
# right_value: Value from the second CSV.
# context: Context values from the compared transaction row.
# Returns: None.
def print_difference(
    row_number: int,
    header: str,
    left_value: str | None,
    right_value: str | None,
    context: list[str],
) -> None:
    parts = [
        fit(str(row_number), DISPLAY_WIDTHS["line"]),
        fit(header, DISPLAY_WIDTHS["column"]),
        fit(format_value(left_value), DISPLAY_WIDTHS["left"]),
        fit(format_value(right_value), DISPLAY_WIDTHS["right"]),
    ]

    for column, value in zip(CONTEXT_COLUMNS, context):
        parts.append(fit(value, DISPLAY_WIDTHS[column]))

    print("  ".join(parts))


# Compares two CSV files by row order and shared column names.
# left_path: First CSV path, usually the older backup.
# right_path: Second CSV path, usually the newer backup.
# Returns: 0 when files match on shared columns, otherwise 1.
def compare_files(left_path: Path, right_path: Path) -> int:
    left_headers, left_rows = read_csv(left_path)
    right_headers, right_rows = read_csv(right_path)

    shared_headers = [header for header in left_headers if header in right_headers]
    ignored_left = [header for header in left_headers if header not in right_headers]
    ignored_right = [header for header in right_headers if header not in left_headers]
    difference_count = 0

    print(f"Comparing {left_path.name} -> {right_path.name}")
    print(f"Shared columns: {len(shared_headers)}")

    if ignored_left:
        print(f"Ignoring columns only in {left_path.name}: {', '.join(ignored_left)}")
    if ignored_right:
        print(f"Ignoring columns only in {right_path.name}: {', '.join(ignored_right)}")

    if len(left_rows) != len(right_rows):
        difference_count += 1
        print(f"Row count differs: {left_path.name} has {len(left_rows)}, {right_path.name} has {len(right_rows)}")

    print()
    print_diff_header(left_path.name, right_path.name)

    for index in range(max(len(left_rows), len(right_rows))):
        row_number = index + 2
        left_row = left_rows[index] if index < len(left_rows) else None
        right_row = right_rows[index] if index < len(right_rows) else None

        if left_row is None or right_row is None:
            difference_count += 1
            print_difference(row_number, "<row>", "exists" if left_row else None, "exists" if right_row else None, get_context(left_row, right_row))
            continue

        for header in shared_headers:
            left_value = left_row.get(header)
            right_value = right_row.get(header)

            if left_value != right_value:
                difference_count += 1
                print_difference(row_number, header, left_value, right_value, get_context(left_row, right_row))

    if difference_count == 0:
        print("No differences found in shared columns.")
        return 0

    print(f"Found {difference_count} difference(s).")
    return 1


# Parses command-line arguments and runs the comparison.
# argv: Command-line arguments, excluding the script name.
# Returns: process exit code.
def main(argv: list[str]) -> int:
    if len(argv) > 2:
        print("Usage: python compare-backups.py [left.csv] [right.csv]", file=sys.stderr)
        return 2

    left_path = Path(argv[0]) if len(argv) >= 1 else Path(DEFAULT_LEFT)
    right_path = Path(argv[1]) if len(argv) >= 2 else Path(DEFAULT_RIGHT)

    return compare_files(left_path, right_path)


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
