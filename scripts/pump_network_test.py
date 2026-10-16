#!/usr/bin/env python3
"""How the network hashrate behaves after a price pump: three variants of the catch-up model, tested on past pumps.

  a) catch-up:  the hashrate catches up with the hashrate that today's revenue carries (scripts/catchup_hashrate.py)
  b) delivery:  the same, but the target is the revenue D days ago (machines are ordered at the top, delivered later)
  c) memory:    the target is an exponential mean of the revenue with half-life M days (miners do not trust a spike)

Calibration: 2-year runs from the actual hashrate on origins every 60 days, driven by the actual revenue; mean
squared log error over all days of all runs. For each test episode the parameters are fitted on origins whose run
does not touch the episode (from a year before the peak to 2 years after it), so the episode is out of sample.

    python3 scripts/pump_network_test.py [--plots DIR]
Writes data/derived/pump_network_test.json.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from calibrate_hashrate import network, rolling, SRC  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / 'data' / 'derived' / 'pump_network_test.json'
NETS = {'btc': (['btc'], '2017-01-01'), 'zec': (['zec'], '2018-07-01'), 'scrypt': (['ltc', 'doge'], '2017-06-01')}
T_UP = [60, 90, 120, 180, 270, 365, 540]
T_DOWN = [90, 365, 730, 1460, 2920]
LEVEL = [0.5, 0.7, 1.0, 1.4, 2.0]
C = 0.2
VARIANTS = {'a': ('dohánění', [0]), 'b': ('zpožděné dodávky', [90, 180, 270, 365]), 'c': ('paměť ceny', [60, 120, 240, 365])}
N = 730
EPISODES = [  # (net, name, origin = start of the test run, peak)
    ('scrypt', 'LTC 2017', '2017-12-18', '2017-12-18'),
    ('scrypt', 'DOGE 2021', '2021-05-07', '2021-05-07'),
    ('scrypt', 'DOGE 2024', '2024-12-08', '2024-12-08'),
    ('zec', 'ZEC 2021', '2021-05-11', '2021-05-11'),
    ('zec', 'ZEC 2025/26, nástup pumpy', '2025-10-01', '2026-09-26'),
    ('btc', 'BTC 2021', '2021-11-08', '2021-11-08'),
]
MARKS = [90, 180, 365, 540, 730]


def drive(lr, kind, v):
    """the revenue signal the target follows"""
    if kind == 'b' and v:
        return np.r_[np.full(v, lr[0]), lr[:-v]]
    if kind == 'c' and v:
        k = 1 - 0.5 ** (1 / v); out = np.empty(len(lr)); m = lr[0]
        for i, x in enumerate(lr):
            m += (x - m) * k; out[i] = m
        return out
    return lr


def simulate(lh, s, lhp, starts, n, up, down):
    """ln hashrate paths for every candidate (up, down, lhp offset) x start; returns (paths [cand, start, n])"""
    ku, kd = (1 - 0.5 ** (1 / up))[:, None], (1 - 0.5 ** (1 / down))[:, None]
    x = np.repeat(lh[starts][None, :], len(up), 0); out = np.empty((len(up), len(starts), n))
    for k in range(n):
        out[:, :, k] = x
        i = np.minimum(starts + k, len(s) - 1)
        y = s[i][None, :] - lhp[:, None] + C * (i[None, :] / 365.25)
        x = x + (y - x) * np.where(y > x, ku, kd)
    return out


def calibrate(lh, lr, t, kind, starts):
    best = None
    hp_med = float(np.median(np.exp(lr - lh)))
    grid = [(u, d, lv) for u in T_UP for d in T_DOWN for lv in LEVEL]
    up, down, lv = (np.array(g, float) for g in zip(*grid))
    lhp = np.log(hp_med * lv) + C * t.mean()          # normal hashprice: ln hp(t) = lhp - C*t
    for v in VARIANTS[kind][1]:
        s = drive(lr, kind, v)
        p = simulate(lh, s, lhp, starts, N, up, down)
        idx = np.minimum(starts[:, None] + np.arange(N)[None, :], len(lh) - 1)
        se = ((p - lh[idx][None]) ** 2).mean(axis=(1, 2))
        j = int(np.argmin(se))
        if best is None or se[j] < best['mse']:
            best = dict(v=v, up=float(up[j]), down=float(down[j]), lhp=float(lhp[j]), mse=float(se[j]))
    return best


def run(lh, lr, kind, prm, i0, n):
    s = drive(lr, kind, prm['v'])
    return simulate(lh, s, np.array([prm['lhp']]), np.array([i0]), n, np.array([prm['up']]), np.array([prm['down']]))[0, 0]


def main():
    plots = Path(sys.argv[sys.argv.index('--plots') + 1]) if '--plots' in sys.argv else None
    hist = json.loads(SRC.read_text())
    res = {'source': hist['source'], 'end': hist['end'], 'episodes': [], 'general': {}}
    cache = {}
    for net, (assets, start) in NETS.items():
        days, H, R = network(hist, assets, start)
        d = np.array(days); lh = np.log(rolling(H, 30)); lr = np.log(rolling(R, 30)); t = np.arange(len(d)) / 365.25
        allst = np.arange(0, len(d) - 365, 60)
        cache[net] = (d, lh, lr, t, allst)
        res['general'][net] = {}
        for kind in VARIANTS:   # all data: parameters for the calculators and the general fit
            prm = calibrate(lh, lr, t, kind, allst)
            res['general'][net][kind] = prm
            print(f"{net:6s} {kind} {VARIANTS[kind][0]:17s} all data: D/M {prm['v']:3d} d, up {prm['up']:.0f} d, down {prm['down']:.0f} d, RMSE {math.sqrt(prm['mse']):.3f}")
    for net, name, origin, peak in EPISODES:
        d, lh, lr, t, allst = cache[net]
        i0 = int(np.argmax(d >= origin)); ip = int(np.argmax(d >= peak)); n = min(N, len(d) - i0)
        ok = (allst + N < ip - 365) | (allst > ip + 730)
        if origin != peak:
            ok &= (allst + N < i0 - 365) | (allst > ip + 730)
        ep = dict(net=net, name=name, origin=origin, peak=peak, days=n, actual=[float(math.exp(lh[i0 + k] - lh[i0])) for k in MARKS if k < n], variants={})
        print(f"\n{name} ({net}), test od {origin}, {n} dní; skutečný hashrate proti startu: " + '  '.join(f"+{k}: {math.exp(lh[i0+k]-lh[i0]):.2f}x" for k in MARKS if k < n))
        for kind in VARIANTS:
            prm = calibrate(lh, lr, t, kind, allst[ok])
            p = run(lh, lr, kind, prm, i0, n)
            err = float(np.mean(np.abs(p - lh[i0:i0 + n])))
            ep['variants'][kind] = dict(prm, path=[float(math.exp(p[k] - lh[i0])) for k in MARKS if k < n], mae=err)
            print(f"   {kind} {VARIANTS[kind][0]:17s} D/M {prm['v']:3d} up {prm['up']:4.0f} down {prm['down']:4.0f}: "
                  + '  '.join(f"{math.exp(p[k]-lh[i0]):.2f}x" for k in MARKS if k < n) + f"   průměrná |log chyba| {err:.2f}")
        res['episodes'].append(ep)
        if plots:
            import datetime as dt
            import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
            a = max(0, i0 - 365); x = [dt.date.fromisoformat(v) for v in d[a:i0 + n]]
            fig, ax = plt.subplots(figsize=(9, 3.8), dpi=110)
            ax.plot(x, np.exp(lh[a:i0 + n] - lh[i0]), color='#11151c', lw=1.8, label='skutečný hashrate')
            for kind, col in zip(VARIANTS, ['#f06a3e', '#2e66f6', '#1b9e77']):
                ax.plot(x[i0 - a:], np.exp(run(lh, lr, kind, ep['variants'][kind], i0, n) - lh[i0]), color=col, lw=1.6, label=VARIANTS[kind][0])
            ax2 = ax.twinx(); ax2.plot(x, np.exp(lr[a:i0 + n] - lr[i0]), color='#999', lw=1, ls=':', label='tržby těžařů')
            ax.set_yscale('log'); ax2.set_yscale('log'); ax.grid(alpha=.25); ax.legend(fontsize=8, loc='upper left', frameon=False)
            ax.set_title(f"{name}: hashrate od {origin} (1 = start testu), tečkovaně tržby", fontsize=10)
            plots.mkdir(parents=True, exist_ok=True); fig.tight_layout(); fig.savefig(plots / f"pump-{name.split(',')[0].replace(' ', '_').replace('/', '-')}.png"); plt.close(fig)
    OUT.write_text(json.dumps(res, indent=1, ensure_ascii=False) + '\n')
    print('wrote', OUT)


if __name__ == '__main__':
    main()
