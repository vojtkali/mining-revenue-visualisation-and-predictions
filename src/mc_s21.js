// Monte Carlo adapter, S21 XP: the BTC price is the only random price.
// Catch-up model: each path runs its own network hashrate, which catches up with that path's revenue (the same
// half-lives as the projection); mined BTC scales with deterministic hashrate / path hashrate.
// Fixed growth: hashrate x (lagged price / scenario price)^MC_KB, so mined BTC per day moves the other way.
const MC_ASSETS = ['btc'], MC_KB = 0.5;
function mcModel(p){
  const s = compute(p), iT = Math.max(0, s.findIndex(r => r.d === TODAY));
  if (p.q.mode !== 'catch') return {s, iT, mined:(i, R, G) => s[i].mined*Math.pow(G[0], -MC_KB)};
  const F = future(p, p.sc), ku = 1 - Math.pow(.5, 1/p.q.up), kd = 1 - Math.pow(.5, 1/p.q.down);
  let x = 0;
  return {s, iT, mined:(i, R) => { const j = i-iT-1, r = F[j]; if (!j) x = r.lf;
    const m = s[i].mined*Math.exp(r.lf - x), y = NET_GAP + r.lrr + p.q.c*(j+1)/365.25 + Math.log(R[0]);
    x += (y - x)*(y > x ? ku : kd); return m; }};
}
