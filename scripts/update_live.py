#!/usr/bin/env python3
"""Refresh closed UTC daily observations; never interpolate or silently carry values.

Coin Metrics Community API (not its discontinued CSV mirror) provides all four
chains. Fetch a complete snapshot before writing anything. Raw observations and
provenance are versioned so every derived result can be reproduced offline.
"""
import datetime as dt
import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DER = ROOT / 'data' / 'derived'
SOURCE = ROOT / 'data' / 'source' / 'coinmetrics.json'
ASSETS = ('btc', 'zec', 'ltc', 'doge')
METRICS = ('PriceUSD', 'HashRate', 'IssTotNtv', 'FeeTotNtv')
START = '2023-05-25'  # includes a trailing week before the earliest chart
API = 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics'


def get(url, raw=False):
    req = urllib.request.Request(url, headers={'User-Agent': 'mining-revenue-visualisation/2', 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as response:
        text = response.read().decode('utf-8')
    return text if raw else json.loads(text)


def download(end):
    url = API + '?' + urllib.parse.urlencode(dict(assets=','.join(ASSETS), metrics=','.join(METRICS), frequency='1d', start_time=START, end_time=end, page_size=10000))
    first_url, rows = url, []
    while url:
        if not url.startswith(API + '?'):
            raise ValueError('Unexpected pagination URL')
        result = get(url)
        rows.extend(result['data'])
        url = result.get('next_page_url')
    return dict(source='Coin Metrics Community API', url=first_url,
                fetchedAt=dt.datetime.now(dt.timezone.utc).isoformat(),
                frequency='1d', timezone='UTC', end=end, data=rows)


def validate(snapshot):
    end = snapshot['end']
    expected = (dt.date.fromisoformat(end) - dt.date.fromisoformat(START)).days + 1
    by_asset = {a: {} for a in ASSETS}
    for row in snapshot['data']:
        asset, date = row['asset'], row['time'][:10]
        if asset not in by_asset or date < START or date > end:
            raise ValueError('Unexpected asset/date')
        if date in by_asset[asset]:
            raise ValueError(f'Duplicate {asset} {date}')
        for key in METRICS:
            val = float(row[key])
            if not math.isfinite(val) or val < 0 or (key != 'FeeTotNtv' and val == 0):
                raise ValueError(f'Invalid {asset} {date} {key}')
        by_asset[asset][date] = {key: float(row[key]) for key in METRICS}
    for asset, rows in by_asset.items():
        if len(rows) != expected or min(rows) != START or max(rows) != end:
            raise ValueError(f'Incomplete daily history: {asset}; nothing published')
    return by_asset


def derive(snapshot):
    db = validate(snapshot)
    dates = sorted(db['btc'])
    result = {name: dict(cmEnd=snapshot['end'], source=snapshot['source'], fetchedAt=snapshot['fetchedAt'], rows=[]) for name in ('btc', 'zec', 'l9')}
    for i, d in enumerate(dates):
        window = dates[max(0, i-6):i+1]
        def avg(a, key): return sum(db[a][day][key] for day in window) / len(window)
        def price(a): return db[a][d]['PriceUSD']
        common = dict(d=d, p=price('btc'), e=0, source='coinmetrics', observedAt=d+'T23:59:59Z')
        if d >= '2024-06-01':
            h = avg('btc', 'HashRate')  # TH/s
            reward = avg('btc', 'IssTotNtv') + avg('btc', 'FeeTotNtv')
            def subsidy(day): return 6.25 if day < '2024-04-20' else 3.125 if day < '2028-04-10' else 1.5625
            blocks = sum(db['btc'][day]['IssTotNtv'] / subsidy(day) for day in window)
            fee = sum(db['btc'][day]['FeeTotNtv'] for day in window) / blocks
            result['btc']['rows'].append(dict(**common, hr=h/1e6, hv=reward/h, fee=fee))
        if d >= '2023-06-01':
            h, fees = avg('zec', 'HashRate'), avg('zec', 'FeeTotNtv')  # GSol/s
            mz = .8*avg('zec', 'IssTotNtv') + fees
            result['zec']['rows'].append(dict(**common, z=price('zec'), hr=h, mz=mz, fees=fees, hv=mz/(h*1e6)*price('zec')/price('btc')))
        if d >= '2024-05-01':
            hl, hg = avg('ltc', 'HashRate'), avg('doge', 'HashRate')  # TH/s
            fl, fg = avg('ltc', 'FeeTotNtv'), avg('doge', 'FeeTotNtv')
            ml, mg = avg('ltc', 'IssTotNtv')+fl, avg('doge', 'IssTotNtv')+fg
            vl, vg = ml/(hl*1e3)*price('ltc'), mg/(hg*1e3)*price('doge')
            result['l9']['rows'].append(dict(**common, l=price('ltc'), g=price('doge'), hl=hl, hg=hg, ml=ml, mg=mg, fl=fl, fg=fg, hv=(vl+vg)/price('btc'), sd=vg/(vl+vg)))
    return result


def czk_rate():
    try:
        txt = get('https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt', raw=True)
        date = dt.datetime.strptime(txt.split()[0], '%d.%m.%Y').date().isoformat()
        for line in txt.splitlines():
            p = line.split('|')
            if len(p) == 5 and p[3] == 'USD':
                return float(p[4].replace(',', '.'))/float(p[2]), date
    except Exception as exc:
        print('CZK refresh failed; previous dated fixing retained:', exc)
    return None, None


def main(offline=False):
    end = (dt.datetime.now(dt.timezone.utc).date()-dt.timedelta(days=1)).isoformat()
    snapshot = json.loads(SOURCE.read_text()) if offline else download(end)
    derived = derive(snapshot)  # fail before any writes on gaps or bad input
    meta_path = DER / 'meta.json'
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    rate, date = (None, None) if offline else czk_rate()
    if rate:
        meta.update(czk=rate, czkSource='ČNB, '+date)
    meta.update(updated=snapshot['end'], fetchedAt=snapshot['fetchedAt'], dataSource=snapshot['source'], priceConvention='UTC daily close; network reward and hashrate trailing 7-day mean')
    meta.pop('liveFrom', None)
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    if not offline:
        SOURCE.write_text(json.dumps(snapshot, separators=(',', ':'), ensure_ascii=False)+'\n')
    for name, data in derived.items():
        (DER/(name+'.json')).write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False)+'\n')
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2)+'\n')
    print('Validated closed daily observations through', snapshot['end'])


if __name__ == '__main__':
    import sys
    main('--offline' in sys.argv)
