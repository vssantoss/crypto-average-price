#!/usr/bin/env python3
"""Compare two backup CSV files while ignoring columns that are not shared."""

from __future__ import annotations

import csv
import errno
import os
import sys
from pathlib import Path


DEFAULT_LEFT = "2024-2025-transactions-v5.1-excel.csv"
DEFAULT_RIGHT = "2024-2025-transactions-v5.2-excel.csv"
CONTEXT_COLUMNS = ["Time (UTC)", "Journal Type", "Instrument", "Side", "Transaction Quantity"]
DISPLAY_WIDTHS = {
    "line": 6,
    "column": 24,
    "Time (UTC)": 22,
    "Journal Type": 20,
    "Instrument": 16,
    "Side": 8,
    "Transaction Quantity": 22,
    "filename": 31,
}


# Builds the aligned separator used after the header and each difference block.
# Returns: dashed separator matching the configured display widths.
def build_separator() -> str:
    parts = [
        "-" * DISPLAY_WIDTHS["line"],
        "-" * DISPLAY_WIDTHS["column"],
    ]

    for column in CONTEXT_COLUMNS:
        parts.append("-" * DISPLAY_WIDTHS[column])

    parts.append("-" * DISPLAY_WIDTHS["filename"])
    parts.append("-" * len("Column Content"))
    return "  ".join(parts)


# Prints columns ignored because they are not present in both CSV files.
# left_name: Display name for the first CSV.
# ignored_left: Columns found only in the first CSV.
# right_name: Display name for the second CSV.
# ignored_right: Columns found only in the second CSV.
# Returns: None.
def print_ignored_columns(
    left_name: str,
    ignored_left: list[str],
    right_name: str,
    ignored_right: list[str],
) -> None:
    print("Ignored columns not present in both files:")

    if not ignored_left and not ignored_right:
        print("  none")
        return

    if ignored_left:
        print(f"  only in {left_name}: {', '.join(ignored_left)}")
    if ignored_right:
        print(f"  only in {right_name}: {', '.join(ignored_right)}")


# Returns whether a parsed column has no physical cells in a CSV.
# rows: Parsed CSV rows from DictReader.
# header: Column name to inspect.
# Returns: True when every row is missing that header's cell.
def column_has_no_cells(rows: list[dict[str, str]], header: str) -> bool:
    return bool(rows) and all(row.get(header) is None for row in rows)


# Splits headers into comparable and ignored sets.
# left_headers: Headers from the first CSV.
# left_rows: Parsed rows from the first CSV.
# right_headers: Headers from the second CSV.
# right_rows: Parsed rows from the second CSV.
# Returns: tuple of shared headers, ignored first-file headers, and ignored second-file headers.
def get_column_sets(
    left_headers: list[str],
    left_rows: list[dict[str, str]],
    right_headers: list[str],
    right_rows: list[dict[str, str]],
) -> tuple[list[str], list[str], list[str]]:
    right_header_set = set(right_headers)
    left_header_set = set(left_headers)
    ignored_left = [header for header in left_headers if header not in right_header_set or column_has_no_cells(left_rows, header)]
    ignored_right = [header for header in right_headers if header not in left_header_set or column_has_no_cells(right_rows, header)]

    # A column is comparable only when it exists in both headers and has physical cells in both files.
    shared_headers = [
        header
        for header in left_headers
        if header in right_header_set
        and header not in ignored_left
        and header not in ignored_right
    ]

    return shared_headers, ignored_left, ignored_right


# Reads a CSV file into headers, row dictionaries, and raw data lines.
# path: CSV path to load.
# Returns: tuple containing the header list, parsed rows, and raw lines after the header.
def read_csv(path: Path) -> tuple[list[str], list[dict[str, str]], list[str]]:
    raw_lines = path.read_text(encoding="utf-8-sig").splitlines()[1:]

    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        headers = reader.fieldnames or []
        return headers, list(reader), raw_lines


# Normalizes a parsed CSV cell for comparison.
# value: Raw DictReader cell value.
# Returns: empty string for missing trailing CSV cells, otherwise the original value.
def normalize_cell(value: str | None) -> str:
    return "" if value is None else value


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


# Prints the aligned summary header for row difference blocks.
# Returns: None.
def print_diff_header() -> None:
    header_parts = [
        fit("Line", DISPLAY_WIDTHS["line"]),
        fit("Column", DISPLAY_WIDTHS["column"]),
    ]

    for column in CONTEXT_COLUMNS:
        header_parts.append(fit(column, DISPLAY_WIDTHS[column]))

    header_parts.append(fit("Filename", DISPLAY_WIDTHS["filename"]))
    header_parts.append("Column Content")

    print("  ".join(header_parts))
    print(build_separator())


# Prints one difference block with row context and full raw CSV lines.
# row_number: CSV line number for the row.
# columns: Column names that differ on this row.
# context: Context values from the compared transaction row.
# left_name: Display name for the first CSV.
# left_line: Raw CSV line from the first CSV, if present.
# right_name: Display name for the second CSV.
# right_line: Raw CSV line from the second CSV, if present.
# Returns: None.
def print_difference_block(
    row_number: int,
    columns: list[str],
    context: list[str],
    left_name: str,
    left_line: str | None,
    right_name: str,
    right_line: str | None,
) -> None:
    column_label = ", ".join(columns)
    first_parts = [
        fit(str(row_number), DISPLAY_WIDTHS["line"]),
        fit(column_label, DISPLAY_WIDTHS["column"]),
    ]
    second_parts = [
        fit("", DISPLAY_WIDTHS["line"]),
        fit("", DISPLAY_WIDTHS["column"]),
    ]

    for column, value in zip(CONTEXT_COLUMNS, context):
        first_parts.append(fit(value, DISPLAY_WIDTHS[column]))
        second_parts.append(fit("", DISPLAY_WIDTHS[column]))

    first_parts.append(fit(left_name, DISPLAY_WIDTHS["filename"]))
    first_parts.append(left_line if left_line is not None else "<missing row>")
    second_parts.append(fit(right_name, DISPLAY_WIDTHS["filename"]))
    second_parts.append(right_line if right_line is not None else "<missing row>")

    print("  ".join(first_parts))
    print("  ".join(second_parts))
    print(build_separator())


# Compares two CSV files by row order and shared column names.
# left_path: First CSV path, usually the older backup.
# right_path: Second CSV path, usually the newer backup.
# Returns: 0 when files match on shared columns, otherwise 1.
def compare_files(left_path: Path, right_path: Path) -> int:
    left_headers, left_rows, left_raw_lines = read_csv(left_path)
    right_headers, right_rows, right_raw_lines = read_csv(right_path)

    shared_headers, ignored_left, ignored_right = get_column_sets(left_headers, left_rows, right_headers, right_rows)
    difference_count = 0

    print(f"Comparing {left_path.name} -> {right_path.name}")
    print(f"Shared columns: {len(shared_headers)}")
    print_ignored_columns(left_path.name, ignored_left, right_path.name, ignored_right)

    if len(left_rows) != len(right_rows):
        difference_count += 1
        print(f"Row count differs: {left_path.name} has {len(left_rows)}, {right_path.name} has {len(right_rows)}")

    print()
    print_diff_header()

    for index in range(max(len(left_rows), len(right_rows))):
        row_number = index + 2
        left_row = left_rows[index] if index < len(left_rows) else None
        right_row = right_rows[index] if index < len(right_rows) else None
        left_line = left_raw_lines[index] if index < len(left_raw_lines) else None
        right_line = right_raw_lines[index] if index < len(right_raw_lines) else None

        if left_row is None or right_row is None:
            difference_count += 1
            print_difference_block(
                row_number,
                ["<row>"],
                get_context(left_row, right_row),
                left_path.name,
                left_line,
                right_path.name,
                right_line,
            )
            continue

        changed_headers = []

        for header in shared_headers:
            left_value = left_row.get(header)
            right_value = right_row.get(header)

            if normalize_cell(left_value) != normalize_cell(right_value):
                changed_headers.append(header)

        if changed_headers:
            difference_count += 1
            print_difference_block(
                row_number,
                changed_headers,
                get_context(left_row, right_row),
                left_path.name,
                left_line,
                right_path.name,
                right_line,
            )

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

    try:
        return compare_files(left_path, right_path)
    except (BrokenPipeError, OSError) as error:
        if isinstance(error, OSError) and error.errno not in (errno.EINVAL, errno.EPIPE):
            raise

        sys.stdout = open(os.devnull, "w", encoding="utf-8")
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
