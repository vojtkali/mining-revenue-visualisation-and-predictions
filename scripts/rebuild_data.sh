#!/usr/bin/env bash
# Rebuild from the complete API history; --offline reuses the versioned snapshot.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/update_live.py "$@"
python3 scripts/build_site.py --pages-only
node scripts/harvest.js
python3 scripts/build_site.py
python3 scripts/build_v2.py --public docs/v2
