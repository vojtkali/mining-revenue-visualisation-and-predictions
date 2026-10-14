#!/usr/bin/env bash
# Re-download Coin Metrics community data and rebuild the derived datasets.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw
for c in btc zec ltc doge; do
  curl -sSL "https://raw.githubusercontent.com/coinmetrics/data/master/csv/$c.csv" -o "data/raw/$c.csv"
done
python3 -I scripts/make_btc.py data/raw/btc.csv data/derived/btc.json
python3 -I scripts/make_zec.py data/raw/btc.csv data/raw/zec.csv scripts/make_btc.py data/derived/zec.json data/manual/zec_cmc_1y.csv
python3 -I scripts/make_l9.py data/raw/btc.csv data/raw/ltc.csv data/raw/doge.csv scripts/make_btc.py data/derived/l9.json
python3 scripts/build_site.py
