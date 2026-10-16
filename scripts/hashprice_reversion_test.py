#!/usr/bin/env python3
"""After a pump: does the miners' revenue per unit of hashrate (hashprice, USD a day) return to its pre-pump level?

Reversion model: ln h(t) = ln E(t) + (ln h0 - ln E(0)) * 0.5^(t/T)
    h0 = hashprice on the test start (the price top), E(t) = level x pre-pump hashprice x (1 - 0.2)^(t/365)
    (machines get more efficient), T = half-life of the excess. T and level are fitted on the OTHER episodes
    (leave one out) by the mean squared log error over 2 years.
Compared with (all from the same start, with nothing known after it):
    persistence        hashprice stays as on the start day
    price + catch-up   the calculators' current Z15 approach: coin price against BTC along the median course of the
                       other pumps (with the actual BTC price, which favours it), network by the catch-up model
                       (parameters on all data of that network, which favours it too), hashprice = revenue / hashrate
Halvings are not modelled (none of the test windows has one of the pumped coin, apart from LTC in August 2019).

    python3 scripts/hashprice_reversion_test.py [--plots DIR]
Writes data/derived/hashprice_reversion_test.json.
"""
import datetime as dt
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from calibrate_hashrate import SRC, rolling  # noqa: E402
import pump_network_test as pnt  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / 'data' / 'derived' / 'hashprice_reversion_test.json'
N = 730
C = 0.2
T_GRID = [30, 45, 60, 90, 120, 180, 240, 365, 540, 730]
L_GRID = [0.03, 0.05, 0.07, 0.1, 0.15, 0.2, 0.3, 0.5, 0.7, 1.0, 1.4, 2.0, 3.0]
UNIT = 'btc' if '--btc' in sys.argv else 'usd'   # hashprice in USD, or in BTC (then x actual BTC for the comparison)
FLAT = '--flat' in sys.argv                         # price + catch-up with BTC flat from the top (no knowledge of BTC)
# name, network, coins of the network (first carries the hashrate), top, pre-pump window, pumped coins (price path applies)
EPISODES = [
    ('Scrypt 2017/18 (LTC, DOGE)', 'scrypt', ['ltc', 'doge'], '2017-12-18', ('2016-06-01', '2017-03-31'), ['ltc', 'doge']),
    ('DOGE 2021', 'scrypt', ['ltc', 'doge'], '2021-05-07', ('2019-11-01', '2020-10-31'), ['doge']),
    ('DOGE 2024', 'scrypt', ['ltc', 'doge'], '2024-12-08', ('2023-08-01', '2024-07-31'), ['doge']),
    ('ZEC 2021', 'zec', ['zec'], '2021-05-11', ('2020-11-20', '2021-01-20'), ['zec']),
    ('BTC 2017', 'btc', ['btc'], '2017-12-17', ('2016-08-01', '2017-04-30'), []),
    ('BTC 2021', 'btc', ['btc'], '2021-11-08', ('2020-06-01', '2020-10-31'), []),
]
NOW = ('ZEC 2026 (teď)', 'zec', ['zec'], '2026-09-26', ('2023-07-01', '2025-08-31'), ['zec'])
MARKS = [90, 180, 365, 540, 730]


def series(hist, a):
    h = hist[a]
    return {d: (p, hr, (i or 0) + (f or 0)) for d, p, hr, i, f in zip(h['d'], h['PriceUSD'], h['HashRate'], h['IssTotNtv'], h['FeeTotNtv']) if p and hr and i}


def load(hist, coins):
    s = [series(hist, c) for c in coins]; b = series(hist, 'btc')
    days = sorted(set.intersection(*(set(x) for x in s)) & set(b))
    H = np.array([s[0][d][1] for d in days])
    P = {c: np.array([x[d][0] for d in days]) for c, x in zip(coins, s)}
    I = {c: np.array([x[d][2] for d in days]) for c, x in zip(coins, s)}
    B = np.array([b[d][0] for d in days])
    return days, H, P, I, B


def hashprice(H, P, I, coins):
    return rolling(sum(P[c] * I[c] for c in coins), 30) / rolling(H, 30)


def episode_data(hist, ep):
    name, net, coins, top, (b0, b1), pumped = ep
    days, H, P, I, B = load(hist, coins)
    d = np.array(days); hp = hashprice(H, P, I, coins)
    if UNIT == 'btc': hp = hp / rolling(B, 30)
    i0 = int(np.argmax(d >= top)); n = min(N, len(d) - i0)
    base = float(np.median(hp[(d >= b0) & (d <= b1)]))
    return dict(name=name, net=net, coins=coins, pumped=pumped, d=d, H=H, P=P, I=I, B=B, hp=hp, i0=i0, n=n, base=base)


def reversion(e, T, L):
    t = np.arange(e['n']); lE = math.log(e['base'] * L) + math.log(1 - C) * t / 365
    x0 = math.log(e['hp'][e['i0']]) - lE[0]
    return np.exp(lE + x0 * 0.5 ** (t / T))


def err(pred, e):
    return float(np.mean(np.abs(np.log(pred) - np.log(e['hp'][e['i0']:e['i0'] + e['n']]))))


def fit(eps):
    best = None
    for T in T_GRID:
        for L in L_GRID:
            se = sum(float(np.mean((np.log(reversion(e, T, L)) - np.log(e['hp'][e['i0']:e['i0'] + e['n']])) ** 2)) for e in eps)
            if best is None or se < best[0]:
                best = (se, T, L)
    return best[1], best[2]


def knots_vs_btc(e):
    """coin/BTC on the marks, relative to the top (first pumped coin)"""
    c = e['pumped'][0]; r = rolling(e['P'][c] / e['B'], 14); i0 = e['i0']
    return {k: float(r[min(i0 + k, len(r) - 1)] / r[i0]) for k in (90, 180, 365, 730) if i0 + k < len(r)}


def price_path(kn, n):
    pts = [(0, 0.0)] + [(k, math.log(v)) for k, v in sorted(kn.items())]
    out = np.empty(n)
    for t in range(n):
        if t >= pts[-1][0]:
            out[t] = pts[-1][1]; continue
        j = next(j for j, p in enumerate(pts) if p[0] >= t)
        (a, ya), (b, yb) = pts[j - 1], pts[j]
        out[t] = ya + (yb - ya) * (t - a) / (b - a)
    return np.exp(out)


def price_catchup(e, others, cal):
    """current approach: median course of the other pumps against BTC x actual BTC; catch-up network"""
    ks = [knots_vs_btc(o) for o in others if o['pumped']]
    kn = {k: float(np.median([x[k] for x in ks if k in x])) for k in (90, 180, 365, 730) if any(k in x for x in ks)}
    i0, n = e['i0'], e['n']; ratio = price_path(kn, n); btc = np.ones(n) if FLAT else e['B'][i0:i0 + n] / e['B'][i0]
    rev = np.array([sum(e['P'][c][i0 + t] * e['I'][c][i0 + t] for c in e['coins']) for t in range(n)])
    for c in e['pumped']:   # replace the actual price of the pumped coins by the modelled one
        rev = rev - e['P'][c][i0:i0 + n] * e['I'][c][i0:i0 + n] + e['P'][c][i0] * ratio * btc * e['I'][c][i0:i0 + n]
    lh, lr, t, prm = cal
    lr2 = lr.copy(); lr2[i0:i0 + n] = np.log(rolling(np.r_[np.exp(lr[i0 - 29:i0]), rev], 30)[29:])
    hpath = pnt.run(lh, lr2, 'a', prm, i0, n)
    hpu = np.exp(lr2[i0:i0 + n] - hpath)
    if UNIT == 'btc': hpu = hpu / rolling(e['B'], 30)[i0:i0 + n]
    return hpu, kn


def main():
    plots = Path(sys.argv[sys.argv.index('--plots') + 1]) if '--plots' in sys.argv else None
    hist = json.loads(SRC.read_text())
    eps = [episode_data(hist, ep) for ep in EPISODES]
    now = episode_data(hist, NOW)
    cals = {}
    for net, (assets, start) in pnt.NETS.items():   # catch-up parameters on all data of each network
        days, H, R = pnt.network(hist, assets, start)
        lh = np.log(rolling(H, 30)); lr = np.log(rolling(R, 30)); t = np.arange(len(days)) / 365.25
        prm = pnt.calibrate(lh, lr, t, 'a', np.arange(0, len(days) - 365, 60))
        cals[net] = (np.array(days), lh, lr, t, prm)
    res = {'source': hist['source'], 'end': hist['end'], 'episodes': []}
    print('hashprice proti úrovni před pumpou (skutečnost | model návratu | dnešní přístup cena+dohánění | setrvání)')
    tot = {'rev': [], 'pc': [], 'per': []}
    for k, e in enumerate(eps):
        others = eps[:k] + eps[k + 1:]
        T, L = fit(others)
        pr = reversion(e, T, L); per = np.full(e['n'], e['hp'][e['i0']])
        row = dict(name=e['name'], top=str(e['d'][e['i0']]), days=e['n'], T=T, L=L, top_vs_base=float(e['hp'][e['i0']] / e['base']),
                   err_reversion=err(pr, e), err_persist=err(per, e))
        act = e['hp'][e['i0']:e['i0'] + e['n']]
        pc = None
        if e['pumped']:
            dd, lh, lr, t, prm = cals[e['net']]
            j0 = int(np.argmax(dd >= e['d'][e['i0']]))
            # align: network() days start later than load() days; run the catch-up on the network's own arrays
            ee = dict(e, i0=j0); ee['P'] = {c: _align(e, c, dd, 'P') for c in e['coins']}; ee['I'] = {c: _align(e, c, dd, 'I') for c in e['coins']}
            ee['B'] = _alignB(e, dd)
            pc, kn = price_catchup(ee, [o for o in others if o['pumped']], (lh, lr, t, prm))
            row['err_price_catchup'] = err(pc, e); row['knots'] = kn
            tot['pc'].append(row['err_price_catchup'])
        tot['rev'].append(row['err_reversion']); tot['per'].append(row['err_persist'])
        # what a machine earns: sum over 1 and 2 years, model / actual
        for yrs in (1, 2):
            m = min(365 * yrs, e['n'])
            row[f'sum{yrs}y_reversion'] = float(pr[:m].sum() / act[:m].sum())
            if pc is not None: row[f'sum{yrs}y_price_catchup'] = float(pc[:m].sum() / act[:m].sum())
        row['marks'] = {str(t): dict(actual=float(act[t] / e['base']), reversion=float(pr[t] / e['base']),
                                     price_catchup=float(pc[t] / e['base']) if pc is not None else None) for t in MARKS if t < e['n']}
        res['episodes'].append(row)
        print(f"\n{e['name']}: vrchol {row['top']}, hashprice na vrcholu {row['top_vs_base']:.1f}× úrovně před pumpou; parametry z ostatních epizod: poločas {T} d, úroveň {L}×")
        for t in MARKS:
            if t < e['n']:
                mk = row['marks'][str(t)]
                print(f"   +{t:3d} d: {mk['actual']:5.2f} | {mk['reversion']:5.2f} | " + (f"{mk['price_catchup']:5.2f}" if pc is not None else '   – ') + f" | {row['top_vs_base']:5.2f}")
        print(f"   průměrná |log chyba|: návrat {row['err_reversion']:.2f}, cena+dohánění " + (f"{row['err_price_catchup']:.2f}" if pc is not None else '–') + f", setrvání {row['err_persist']:.2f}")
        print(f"   součet výdělku model/skutečnost: 1 rok návrat {row['sum1y_reversion']:.2f}" + (f", cena+dohánění {row['sum1y_price_catchup']:.2f}" if pc is not None else '')
              + f"; 2 roky návrat {row['sum2y_reversion']:.2f}" + (f", cena+dohánění {row['sum2y_price_catchup']:.2f}" if pc is not None else ''))
        if plots:
            import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
            a = max(0, e['i0'] - 365); x = [dt.date.fromisoformat(v) for v in e['d'][a:e['i0'] + e['n']]]
            fig, ax = plt.subplots(figsize=(9, 3.6), dpi=110)
            ax.plot(x, e['hp'][a:e['i0'] + e['n']] / e['base'], color='#11151c', lw=1.8, label='skutečnost')
            xs = x[e['i0'] - a:]
            ax.plot(xs, pr / e['base'], color='#2e66f6', lw=1.8, label=f'model návratu (poločas {T} d, úroveň {L}×)')
            if pc is not None: ax.plot(xs, pc / e['base'], color='#f06a3e', lw=1.4, ls='--', label='dnešní přístup: cena po pumpě + dohánění sítě')
            ax.axhline(1, color='#999', lw=.8, ls=':')
            ax.set_yscale('log'); ax.grid(alpha=.25); ax.legend(fontsize=8, frameon=False, loc='upper right')
            ax.set_title(f"{e['name']}: výdělek na výkon sítě, 1 = úroveň před pumpou", fontsize=10)
            plots.mkdir(parents=True, exist_ok=True); fig.tight_layout()
            fig.savefig(plots / f"hp-{e['name'].split(' (')[0].replace(' ', '_').replace('/', '-')}.png"); plt.close(fig)
    T, L = fit(eps)
    res['all'] = dict(T=T, L=L, mean_err_reversion=float(np.mean(tot['rev'])), mean_err_price_catchup=float(np.mean(tot['pc'])),
                      mean_err_persist=float(np.mean(tot['per'])))
    res['zec_now'] = dict(top=str(now['d'][now['i0']]), top_vs_base=float(now['hp'][now['i0']] / now['base']),
                          today_vs_base=float(now['hp'][-1] / now['base']), base=now['base'])
    print(f"\nprůměr: návrat {res['all']['mean_err_reversion']:.2f}, cena+dohánění (jen altcoiny) {res['all']['mean_err_price_catchup']:.2f}, setrvání {res['all']['mean_err_persist']:.2f}")
    print(f"všechny epizody: poločas {T} d, úroveň {L}×;  ZEC teď {res['zec_now']['today_vs_base']:.1f}× úrovně před pumpou")
    OUT.write_text(json.dumps(res, indent=1, ensure_ascii=False) + '\n')
    print('wrote', OUT)


def _align(e, c, dd, key):
    m = dict(zip(e['d'], e[key][c])); return np.array([m.get(x, np.nan) for x in dd])


def _alignB(e, dd):
    m = dict(zip(e['d'], e['B'])); return np.array([m.get(x, np.nan) for x in dd])


if __name__ == '__main__':
    main()
