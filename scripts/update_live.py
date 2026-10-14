#!/usr/bin/env python3
"""Extend data/derived/{btc,zec,l9}.json up to today from public APIs.

Run daily (GitHub Actions). For every day between the last stored row and today it
appends a row: today's values come from the APIs, days in between are interpolated.
A row for today that was written by an earlier run on the same day is replaced.

Sources (first one that answers wins):
  prices    CoinGecko simple/price, Coinbase spot, Blockchair stats
  BTC       mempool.space hashrate (7-day mean of daily averages) and reward stats
            (subsidy + fees per block over the last 1008 blocks); Blockchair 24h hashrate
  LTC       litecoinspace.org hashrate; Blockchair 24h hashrate
  ZEC, DOGE Blockchair 24h hashrate (smoothed, see EMA)
  USD/CZK   ČNB daily fixing

Rewards per day of ZEC, LTC and DOGE stay at the last stored value and are halved at
the scheduled halvings. A hashrate that can't be fetched, or that is more than 2x away
from the last stored value, keeps the last value. A missing price aborts the run, so
no stale price is ever written as a new day.
"""
import json, math, sys, urllib.request, datetime as dt
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DER = ROOT / 'data' / 'derived'
D = dt.date.fromisoformat
EMA = 0.3          # weight of today's 24h hashrate estimate (noisy) vs the stored value
UA = {'User-Agent': 'mining-revenue-visualisation (github actions)', 'Accept': 'application/json'}


def log(*a):
    print(*a, file=sys.stderr)


def get(url, raw=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read().decode('utf-8')
    return body if raw else json.loads(body)


def first(name, *fns):
    for fn in fns:
        try:
            v = fn()
            if v is not None and v > 0 and math.isfinite(v):
                log(f'{name}: {v:g} ({fn.__name__})')
                return v
        except Exception as e:  # noqa: BLE001 - any failure means "try the next source"
            log(f'{name}: {fn.__name__} failed: {e}')
    log(f'{name}: no source answered')
    return None


# ---------- prices ----------
CG = {'btc': 'bitcoin', 'zec': 'zcash', 'ltc': 'litecoin', 'doge': 'dogecoin'}
BC = {'btc': 'bitcoin', 'zec': 'zcash', 'ltc': 'litecoin', 'doge': 'dogecoin'}
_cg = {}


def price(sym):
    def coingecko():
        if not _cg:
            _cg.update(get('https://api.coingecko.com/api/v3/simple/price?ids=' + ','.join(CG.values()) + '&vs_currencies=usd'))
        return float(_cg[CG[sym]]['usd'])

    def coinbase():
        return float(get(f'https://api.coinbase.com/v2/prices/{sym.upper()}-USD/spot')['data']['amount'])

    def blockchair():
        return float(get(f'https://api.blockchair.com/{BC[sym]}/stats')['data']['market_price_usd'])
    return first(f'price {sym}', coingecko, coinbase, blockchair)


# ---------- network hashrate (returned in H/s or Sol/s) ----------
def mempool_hashrate(base):
    def f():
        hs = get(base + '/api/v1/mining/hashrate/1m')['hashrates'][-7:]
        return sum(float(h['avgHashrate']) for h in hs) / len(hs)
    f.__name__ = base.split('//')[1]
    return f


def blockchair_hashrate(chain):
    def f():
        return float(get(f'https://api.blockchair.com/{chain}/stats')['data']['hashrate_24h'])
    f.__name__ = 'blockchair'
    f.noisy = True
    return f


def fetch_hashrate(name, last, *fns):
    """Hashrate in the unit of `last`: the API unit is detected as the power of 1000
    that lands closest to the stored value. Noisy 24h estimates are smoothed."""
    for fn in fns:
        v = first(f'hashrate {name}', fn)
        if v is None:
            continue
        k = round(math.log(last / v, 1000))
        x = v * 1000 ** k
        if not 0.5 < x / last < 2:
            log(f'hashrate {name}: {x:g} too far from last {last:g}, ignored')
            continue
        return last + EMA * (x - last) if getattr(fn, 'noisy', False) else x
    log(f'hashrate {name}: keeping last value {last:g}')
    return last


def btc_reward_day():
    def mempool():
        s = get('https://mempool.space/api/v1/mining/reward-stats/1008')
        n = int(s['endBlock']) - int(s['startBlock']) + 1
        return float(s['totalReward']) / n * 144 / 1e8
    return first('BTC reward per day', mempool)


def czk_rate():
    try:
        txt = get('https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt', raw=True)
        date = dt.datetime.strptime(txt.split()[0], '%d.%m.%Y').date().isoformat()
        for line in txt.splitlines():
            p = line.split('|')
            if len(p) == 5 and p[3] == 'USD':
                return round(float(p[4].replace(',', '.')) / float(p[2]), 3), date
    except Exception as e:  # noqa: BLE001
        log('CZK rate failed:', e)
    return None, None


# ---------- halvings ----------
def subsidy_btc(d): return 3.125 if d < '2028-04-10' else 1.5625
def subsidy_ltc(d): return 6.25 if d < '2027-07-30' else 3.125
def subsidy_zec(d): return 1.5625 if d < '2028-11-20' else 0.78125


# ---------- dataset update ----------
def load(name):
    return json.loads((DER / f'{name}.json').read_text())


def save(name, obj):
    (DER / f'{name}.json').write_text(json.dumps(obj, separators=(',', ':'), ensure_ascii=False))


def days_to_fill(rows, today, live_from):
    """Drop a same-day row from an earlier live run, return (anchor row, list of new dates)."""
    while rows and rows[-1]['d'] >= today and rows[-1]['d'] >= live_from:
        rows.pop()
    a = rows[-1]
    n = (D(today) - D(a['d'])).days
    return a, [(D(a['d']) + dt.timedelta(i)).isoformat() for i in range(1, n + 1)]


def lerp(a, b, t): return a + (b - a) * t


def main():
    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    meta_path = DER / 'meta.json'
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    btc, zec, l9 = load('btc'), load('zec'), load('l9')
    live_from = meta.get('liveFrom') or (D(btc['rows'][-1]['d']) + dt.timedelta(1)).isoformat()

    P = {s: price(s) for s in ('btc', 'zec', 'ltc', 'doge')}
    if None in P.values():
        sys.exit('price missing, nothing written')

    # --- BTC ---
    a, dates = days_to_fill(btc['rows'], today, live_from)
    if not dates:
        log('data already up to date'); return
    hr = fetch_hashrate('btc', a['hr'] * 1e18, mempool_hashrate('https://mempool.space'), blockchair_hashrate('bitcoin')) / 1e18
    rew_a = a['hv'] * a['hr'] * 1e6
    fee_a = max(0.0, rew_a - 144 * subsidy_btc(a['d']))
    rew = btc_reward_day() or 144 * subsidy_btc(today) + fee_a
    for i, d in enumerate(dates, 1):
        t = i / len(dates)
        h = lerp(a['hr'], hr, t)
        r = lerp(rew_a, rew, t) if subsidy_btc(d) == subsidy_btc(today) else 144 * subsidy_btc(d) + fee_a
        btc['rows'].append(dict(d=d, p=round(lerp(a['p'], P['btc'], t), 2), hr=round(h, 1), hv=round(r / (h * 1e6), 10), e=0))
    bp = {r['d']: r['p'] for r in btc['rows']}

    # --- ZEC (hr in GSol/s, mz = miner ZEC per day) ---
    a, dates = days_to_fill(zec['rows'], today, live_from)
    hr = fetch_hashrate('zec', a['hr'] * 1e9, blockchair_hashrate('zcash')) / 1e9
    for i, d in enumerate(dates, 1):
        t = i / len(dates)
        h, z, p = lerp(a['hr'], hr, t), lerp(a['z'], P['zec'], t), bp[d]
        mz = a['mz'] * subsidy_zec(d) / subsidy_zec(a['d'])
        zec['rows'].append(dict(d=d, p=p, z=round(z, 3), hr=round(h, 3), mz=round(mz, 1), e=0, hv=round(mz / (h * 1e6) * z / p, 12)))

    # --- L9 (hl, hg in TH/s; ml LTC/day, mg DOGE/day; sd = DOGE share of revenue) ---
    a, dates = days_to_fill(l9['rows'], today, live_from)
    hl = fetch_hashrate('ltc', a['hl'] * 1e12, mempool_hashrate('https://litecoinspace.org'), blockchair_hashrate('litecoin')) / 1e12
    hg = fetch_hashrate('doge', a['hg'] * 1e12, blockchair_hashrate('dogecoin')) / 1e12
    for i, d in enumerate(dates, 1):
        t = i / len(dates)
        l, g, p = lerp(a['l'], P['ltc'], t), lerp(a['g'], P['doge'], t), bp[d]
        h1, h2 = lerp(a['hl'], hl, t), lerp(a['hg'], hg, t)
        ml, mg = a['ml'] * subsidy_ltc(d) / subsidy_ltc(a['d']), a['mg']
        vl, vg = ml / (h1 * 1e3) * l, mg / (h2 * 1e3) * g
        l9['rows'].append(dict(d=d, p=p, l=round(l, 3), g=round(g, 5), hl=round(h1, 1), hg=round(h2, 1), ml=round(ml, 2), mg=mg,
                               e=0, hv=round((vl + vg) / p, 12), sd=round(vg / (vl + vg), 4)))

    for name, obj in (('btc', btc), ('zec', zec), ('l9', l9)):
        assert obj['rows'][-1]['d'] == today, name
        save(name, obj)
    rate, rate_date = czk_rate()
    meta.update(liveFrom=live_from, updated=today)
    if rate:
        meta.update(czk=rate, czkSource='ČNB, ' + D(rate_date).strftime('%-d. %-m. %Y'))
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + '\n')
    log('updated to', today)


if __name__ == '__main__':
    main()
