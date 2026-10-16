#!/usr/bin/env python3
"""How network hashrate follows miner revenue: calibration on the long daily history.

Model (per network, daily):
    ln H_t = a + g*t + e * ln Rbar_t
H = hashrate (30-day mean), t = years, R = USD paid to all miners a day (issuance + fees) x price,
Rbar = R smoothed with an asymmetric exponential lag: time constant L_up while revenue is above its smoothed
value (new machines take months to order, ship and plug in), L_down while it is below (old machines are switched
off sooner). g = trend not explained by revenue (cheaper hashing over time), e = elasticity.
In a projection: H_t = H_0 * exp(g*t) * (Rbar_t / Rbar_0)^e, so the scenario's price path drives the network.

Fit: grid over L_up, L_down; OLS for a, g, e on the training years; then the test years are predicted from the
actual revenue with the training parameters (no refit) and compared with a fixed-growth baseline (the growth rate
of the training years' last 3 years). Scrypt: LTC hashrate against LTC + DOGE revenue (merge mining).

    python3 scripts/calibrate_hashrate.py [--split 2023-01-01] [--plots DIR]
Writes data/derived/hashrate_model.json.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'source' / 'history.json'
OUT = ROOT / 'data' / 'derived' / 'hashrate_model.json'
# training starts once each network is mined with ASICs (ZEC: Equihash ASICs from mid-2018)
NETS = {'btc': (['btc'], '2017-01-01'), 'zec': (['zec'], '2018-07-01'), 'scrypt': (['ltc', 'doge'], '2017-06-01')}
ELAST = [0.3, 0.5, 0.7, 1.0]
LAGS = [1, 30, 60, 90, 120, 180, 240, 300, 365, 450, 540, 730, 900, 1095]
SMOOTH = 30


def series(hist, asset):
    h = hist[asset]
    return {d: (p, hr, (i or 0) + (f or 0)) for d, p, hr, i, f in zip(h['d'], h['PriceUSD'], h['HashRate'], h['IssTotNtv'], h['FeeTotNtv'])
            if p and hr and i}


def network(hist, assets, start):
    s = [series(hist, a) for a in assets]
    days = sorted(set.intersection(*(set(x) for x in s)))
    days = [d for d in days if d >= start]
    H = np.array([s[0][d][1] for d in days])                     # first asset carries the hashrate (LTC for Scrypt)
    R = np.array([sum(x[d][0] * x[d][2] for x in s) for d in days])  # USD to miners a day
    return days, H, R


def rolling(x, w):
    c = np.cumsum(np.insert(x, 0, 0.0)); out = np.empty(len(x))
    for i in range(len(x)):
        j = max(0, i - w + 1); out[i] = (c[i + 1] - c[j]) / (i + 1 - j)
    return out


def lagged(R, up, down):
    """Asymmetric exponential smoothing of log revenue."""
    x = np.log(R); out = np.empty(len(x)); m = x[0]
    for i, v in enumerate(x):
        m += (v - m) / (up if v > m else down)
        out[i] = m
    return out


def fit(lh, lr, t):
    X = np.c_[np.ones(len(t)), t, lr]
    b, *_ = np.linalg.lstsq(X, lh, rcond=None)
    return b, X @ b


def main():
    split = sys.argv[sys.argv.index('--split') + 1] if '--split' in sys.argv else '2023-01-01'
    plots = Path(sys.argv[sys.argv.index('--plots') + 1]) if '--plots' in sys.argv else None
    hist = json.loads(SRC.read_text())
    result = {'source': hist['source'], 'end': hist['end'], 'split': split, 'nets': {}}
    for net, (assets, start) in NETS.items():
        days, H, R = network(hist, assets, start)
        lh = np.log(rolling(H, SMOOTH)); t = (np.arange(len(days))) / 365.25
        tr = np.array([d < split for d in days]); te = ~tr
        best = None
        for e in ELAST:                        # elasticity on a grid (a free fit confuses it with the trend)
            for up in LAGS:
                for down in LAGS:
                    if down > up: continue      # switching off is never slower than plugging in
                    lr = lagged(R, up, down)
                    y = lh - e * lr
                    X = np.c_[np.ones(tr.sum()), t[tr]]; b, *_ = np.linalg.lstsq(X, y[tr], rcond=None)
                    pred = b[0] + b[1] * t + e * lr
                    rmse_tr = float(np.sqrt(np.mean((lh[tr] - pred[tr]) ** 2)))
                    if best is None or rmse_tr < best['rmse_train']:
                        best = dict(up=up, down=down, a=float(b[0]), g=float(b[1]), e=e, rmse_train=rmse_tr, pred=pred)
        pred = best.pop('pred')
        # test: anchored at the last training day, like a projection from "today"
        i0 = int(np.argmax(te)) - 1
        lr = lagged(R, best['up'], best['down'])
        anch = lh[i0] + best['g'] * (t - t[i0]) + best['e'] * (lr - lr[i0])
        n3 = int(3 * 365.25)
        g_base = (lh[i0] - lh[i0 - n3]) / 3            # fixed growth: the last 3 training years
        base = lh[i0] + g_base * (t - t[i0])
        rm = lambda p: float(np.sqrt(np.mean((lh[te] - p[te]) ** 2)))
        end_err = lambda p: float(math.exp(p[-1] - lh[-1]) - 1)
        stats = dict(net=net, start=days[0], end=days[-1], **best,
                     rmse_test_model=rm(anch), rmse_test_fixed=rm(base), g_fixed=float(g_base),
                     end_error_model=end_err(anch), end_error_fixed=end_err(base),
                     trend_pct=float(math.exp(best['g']) - 1), fixed_pct=float(math.exp(g_base) - 1))
        result['nets'][net] = stats
        print(f"{net:6s} lag up {best['up']:4d} d, down {best['down']:4d} d, elasticity {best['e']:.2f}, trend {stats['trend_pct']*100:+.0f} %/y | "
              f"test RMSE(ln H) model {stats['rmse_test_model']:.3f} vs fixed {stats['rmse_test_fixed']:.3f} | "
              f"error at {days[-1]}: model {stats['end_error_model']*100:+.0f} %, fixed {stats['end_error_fixed']*100:+.0f} %")
        if plots:
            import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
            import datetime as dt
            x = [dt.date.fromisoformat(d) for d in days]
            fig, ax = plt.subplots(figsize=(11, 4.2), dpi=110)
            ax.plot(x, np.exp(lh), color='#11151c', lw=1.6, label='skutečný hashrate (30denní průměr)')
            ax.plot(x, np.exp(pred), color='#2e66f6', lw=1, alpha=.6, label='model, nastaven na trénovacích letech')
            ax.plot(x[i0:], np.exp(anch[i0:]), color='#2e66f6', lw=2, label='model: test z reálných tržeb (bez přenastavení)')
            ax.plot(x[i0:], np.exp(base[i0:]), color='#f06a3e', lw=2, ls='--', label=f'pevný růst {stats["fixed_pct"]*100:+.0f} %/rok')
            ax.axvline(x[i0], color='#8a91a0', ls=':', lw=1)
            ax.set_yscale('log'); ax.grid(alpha=.25); ax.legend(fontsize=8, loc='upper left', frameon=False)
            ax.set_title(f"{net.upper()}: zpoždění růst {best['up']} d / pokles {best['down']} d, citlivost {best['e']:.2f}, trend {stats['trend_pct']*100:+.0f} %/rok", fontsize=10)
            plots.mkdir(parents=True, exist_ok=True); fig.tight_layout(); fig.savefig(plots / f'hashrate-{net}.png'); plt.close(fig)
    OUT.write_text(json.dumps(result, indent=1, ensure_ascii=False) + '\n')
    print('wrote', OUT)


if __name__ == '__main__':
    main()
