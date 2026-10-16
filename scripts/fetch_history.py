#!/usr/bin/env python3
"""Long daily history of the four chains for calibrating how network hashrate follows miner revenue.

Coin Metrics Community API, daily: price (USD), hashrate, issuance and fees (native units). Written to
data/source/history.json as {asset: {"start": date, "d": [...], metric: [...]}}; a missing value is null.
Not part of the daily update: it is fetched once (or when the calibration is redone) by the history workflow.

    python3 scripts/fetch_history.py
"""
import datetime as dt
import json
from pathlib import Path

from update_live import API, get, urllib

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'source' / 'history.json'
METRICS = ('PriceUSD', 'HashRate', 'IssTotNtv', 'FeeTotNtv')
# from when each chain has a meaningful price and hashrate history (ZEC launched 10/2016, DOGE merged with LTC 9/2014)
STARTS = {'btc': '2013-01-01', 'ltc': '2014-01-01', 'doge': '2014-09-01', 'zec': '2016-11-01'}


def fetch(asset, start, end):
    url = API + '?' + urllib.parse.urlencode(dict(assets=asset, metrics=','.join(METRICS), frequency='1d',
                                                  start_time=start, end_time=end, page_size=10000))
    rows = []
    while url:
        if not url.startswith(API + '?'):
            raise ValueError('Unexpected pagination URL')
        res = get(url)
        rows.extend(res['data'])
        url = res.get('next_page_url')
    return rows


def num(v):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return None
    return x if x == x else None


def main():
    end = (dt.datetime.now(dt.timezone.utc).date() - dt.timedelta(days=1)).isoformat()
    out = {'source': 'Coin Metrics Community API', 'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'end': end}
    for asset, start in STARTS.items():
        rows = sorted(fetch(asset, start, end), key=lambda r: r['time'])
        out[asset] = {'d': [r['time'][:10] for r in rows], **{m: [num(r.get(m)) for r in rows] for m in METRICS}}
        print(asset, out[asset]['d'][0], '…', out[asset]['d'][-1], len(rows), 'days')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(',', ':')) + '\n')
    print('wrote', OUT)


if __name__ == '__main__':
    main()
