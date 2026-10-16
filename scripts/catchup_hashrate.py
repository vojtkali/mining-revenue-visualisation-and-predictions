#!/usr/bin/env python3
"""Catch-up model of network hashrate, tested on history.

Target: the hashrate at which miners earn a "normal" hashprice,
    ln H*_t = ln R_t - ln hp0 + c*t
R = USD paid to all miners a day (30-day mean), hp0 = normal USD per unit of hashrate at the start,
c = yearly fall of that normal level (machines get more efficient, so the same revenue carries more hashrate).
Dynamics: every day the hashrate closes a share of the gap to the target, with half-life T_up while it is below
the target (machines must be built and plugged in) and T_down while above it (machines are switched off).

Calibration: grid over T_up, T_down, c; hp0 by a grid around the training median. Each candidate is simulated
over the training years from the actual first hashrate with the actual revenue. Test: from an origin day the
model runs on (with parameters fitted only on data before it) from the actual hashrate that day, driven by the
actual revenue; compared with fixed growth (the last 3 years' rate before the origin).

    python3 scripts/catchup_hashrate.py [--plots DIR]
Writes data/derived/hashrate_catchup.json.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from calibrate_hashrate import network, rolling, SRC  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / 'data' / 'derived' / 'hashrate_catchup.json'
NETS = {'btc': (['btc'], '2017-01-01'), 'zec': (['zec'], '2018-07-01'), 'scrypt': (['ltc', 'doge'], '2017-06-01')}
T_UP = [60, 90, 120, 180, 270, 365, 540]
T_DOWN = [30, 90, 180, 365, 730, 1460, 2920]
C = [0.2]   # efficiency gain fixed: from a single training window it is not identified (it comes out 0 and the model undershoots)
CAP = [1.0, 2.0, 4.0, 1e9]        # most the network can grow in a year (machines must be manufactured): +100 %, +200 %, +400 %, no cap
LEVEL = [0.5, 0.7, 1.0, 1.4, 2.0]
ORIGINS = ['2021-01-01', '2022-01-01', '2023-01-01', '2024-01-01', '2025-01-01', '2025-07-01']


def simulate(lh0, lr, t, hp0, c, up, down, cap=1e9):
    """ln hashrate path from lh0, driven by ln revenue lr (arrays from the start day)."""
    ku, kd = 1 - 0.5 ** (1 / up), 1 - 0.5 ** (1 / down); mx = math.log1p(cap) / 365.25
    target = lr - math.log(hp0) + c * (t - t[0])
    out = np.empty(len(lr)); x = lh0
    for i, y in enumerate(target):
        out[i] = x
        x += min((y - x) * (ku if y > x else kd), mx)
    return out


def calibrate(lh, lr, t, m):
    """Best parameters on the days in mask m (a contiguous training window); all candidates simulated at once."""
    idx = np.flatnonzero(m); a, b = idx[0], idx[-1] + 1
    hp_med = float(np.median(np.exp(lr[a:b] - lh[a:b])))
    grid = [(up, down, c, lv, cap) for up in T_UP for down in T_DOWN for c in C for lv in LEVEL for cap in CAP]
    up, down, c, lv, cap = (np.array(v, float) for v in zip(*grid))
    mx = np.log1p(cap) / 365.25
    ku, kd = 1 - 0.5 ** (1 / up), 1 - 0.5 ** (1 / down)
    tm = t[a:b].mean()
    lhp0 = np.log(hp_med * lv) - c * (t[a] - tm)      # ln hp0 at the window start
    x = np.full(len(grid), lh[a]); se = np.zeros(len(grid))
    for i in range(a, b):
        se += (x - lh[i]) ** 2
        y = lr[i] - lhp0 + c * (t[i] - t[a])
        x = x + np.minimum((y - x) * np.where(y > x, ku, kd), mx)
    k = int(np.argmin(se)); g = grid[k]
    return dict(up=g[0], down=g[1], c=g[2], cap=g[4], hp0=float(math.exp(lhp0[k])), t0=float(t[a]), rmse=float(math.sqrt(se[k] / (b - a))))


def run_from(lh, lr, t, i0, n, prm):
    hp_i0 = prm['hp0'] * math.exp(-prm['c'] * (t[i0] - prm['t0']))
    return simulate(lh[i0], lr[i0:i0 + n], t[i0:i0 + n], hp_i0, prm['c'], prm['up'], prm['down'], prm['cap'])


def main():
    plots = Path(sys.argv[sys.argv.index('--plots') + 1]) if '--plots' in sys.argv else None
    hist = json.loads(SRC.read_text())
    result = {'source': hist['source'], 'end': hist['end'], 'nets': {}}
    for net, (assets, start) in NETS.items():
        days, H, R = network(hist, assets, start)
        d = np.array(days); lh = np.log(rolling(H, 30)); lr = np.log(rolling(R, 30)); t = np.arange(len(d)) / 365.25
        rows = []; cache = {}
        for o in ORIGINS:
            i0 = int(np.argmax(d >= o)); n = min(730, len(d) - i0)
            prm = cache[o] = calibrate(lh, lr, t, np.arange(len(d)) < i0)
            p = run_from(lh, lr, t, i0, n, prm)
            gf = (lh[i0] - lh[i0 - 1096]) / 3
            f = lh[i0] + gf * (t[i0:i0 + n] - t[i0])
            rows.append(dict(origin=o, horizon_days=n, err_model=float(math.exp(p[-1] - lh[i0 + n - 1]) - 1),
                             err_fixed=float(math.exp(f[-1] - lh[i0 + n - 1]) - 1),
                             rmse_model=float(np.sqrt(np.mean((p - lh[i0:i0 + n]) ** 2))),
                             rmse_fixed=float(np.sqrt(np.mean((f - lh[i0:i0 + n]) ** 2))),
                             fixed_pct=float(math.exp(gf) - 1), **{k: prm[k] for k in ('up', 'down', 'c', 'cap')}))
        full = calibrate(lh, lr, t, np.ones(len(d), bool))   # all data: the parameters for the calculators
        hp_now = full['hp0'] * math.exp(-full['c'] * (t[-1] - full['t0']))
        gap = float(lr[-1] - math.log(hp_now) - lh[-1])
        # for the calculators: normal hashprice (USD a day per Coin Metrics hashrate unit) on the last day, falling by c a year
        result['nets'][net] = dict(start=days[0], end=days[-1], tests=rows, params=dict(up=full['up'], down=full['down'], c=full['c'], cap=full['cap'],
                                   rmse_all=full['rmse']), lhp_ref=float(math.log(hp_now)), ref=days[-1], gap_now=gap, target_vs_now=float(math.exp(gap)))
        mm = np.mean([abs(math.log(1 + r['err_model'])) for r in rows]); mf = np.mean([abs(math.log(1 + r['err_fixed'])) for r in rows])
        print(f"{net:6s} all data: half-life up {full['up']} d, down {full['down']} d, efficiency {full['c']*100:.0f} %/y, cap {full['cap']:g}/y, fit RMSE {full['rmse']:.3f}; "
              f"target today = {math.exp(gap):.2f}x the actual hashrate")
        for r in rows:
            print(f"   from {r['origin']} ({r['horizon_days']} d): error model {r['err_model']*100:+5.0f} %  fixed {r['err_fixed']*100:+5.0f} % "
                  f"(fixed {r['fixed_pct']*100:+.0f} %/y)  params up {r['up']} down {r['down']} c {r['c']} cap {r['cap']:g}")
        print(f"   mean |log error| at the horizon: model {mm:.2f}, fixed {mf:.2f}")
        if plots:
            import datetime as dt
            import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
            x = [dt.date.fromisoformat(v) for v in days]
            fig, ax = plt.subplots(figsize=(11, 4.4), dpi=110)
            ax.plot(x, np.exp(lh), color='#11151c', lw=1.8, label='skutečný hashrate')
            for k, o in enumerate(ORIGINS):
                i0 = int(np.argmax(d >= o)); n = min(730, len(d) - i0)
                prm = cache[o]
                p = run_from(lh, lr, t, i0, n, prm)
                gf = (lh[i0] - lh[i0 - 1096]) / 3; f = lh[i0] + gf * (t[i0:i0 + n] - t[i0])
                ax.plot(x[i0:i0 + n], np.exp(p), color='#2e66f6', lw=2, label='model dohánění (test, 2 roky dopředu)' if k == 0 else None)
                ax.plot(x[i0:i0 + n], np.exp(f), color='#f06a3e', lw=1.4, ls='--', label='pevný růst z posledních 3 let' if k == 0 else None)
            ax.set_yscale('log'); ax.grid(alpha=.25); ax.legend(fontsize=8, loc='upper left', frameon=False)
            ax.set_title(f"{net.upper()}: testy z {len(ORIGINS)} výchozích dnů; parametry z dat před každým z nich", fontsize=10)
            plots.mkdir(parents=True, exist_ok=True); fig.tight_layout(); fig.savefig(plots / f'catchup-{net}.png'); plt.close(fig)
    OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False) + '\n')
    print('wrote', OUT)


if __name__ == '__main__':
    main()
