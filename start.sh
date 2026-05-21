#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  cat <<'EOF'
Node.js was not found.

Step-by-step:
1. Install the latest Node.js LTS from https://nodejs.org/en/download
2. Close and reopen your terminal so PATH is refreshed.
3. Confirm the install with: node --version
4. Run ./start.sh again.
EOF
  exit 1
fi

node "$SCRIPT_DIR/scripts/start-dev.mjs"
