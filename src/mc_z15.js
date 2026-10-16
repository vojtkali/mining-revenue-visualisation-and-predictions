// Monte Carlo adapter, Z15 Pro: BTC and ZEC prices are random (drawn on the same days). Mined BTC scales with ZEC/BTC.
// Catch-up model: each path's Zcash hashrate catches up with that path's ZEC revenue (half-lives as in the projection).
// Fixed growth: Zcash hashrate follows the ZEC price with a lag and the sensitivity from the panel (zk).
const MC_ASSETS = ['btc', 'zec'];
function mcModel(p){
  const s = compute(p), iT = Math.max(0, s.findIndex(r => r.d === TODAY));
  if (p.q.mode !== 'catch') return {s, iT, mined:(i, R, G) => s[i].mined*R[1]/R[0]*Math.pow(G[1], -p.k)};
  const F = future(p, p.sc), ku = 1 - Math.pow(.5, 1/p.q.up), kd = 1 - Math.pow(.5, 1/p.q.down);
  let x = 0;
  return {s, iT, mined:(i, R) => { const j = i-iT-1, r = F[j]; if (!j) x = r.lf;
    const m = s[i].mined*R[1]/R[0]*Math.exp(r.lf - x), y = NET_GAP + r.lrr + p.q.c*(j+1)/365.25 + Math.log(R[1]);
    x += (y - x)*(y > x ? ku : kd); return m; }};
}
