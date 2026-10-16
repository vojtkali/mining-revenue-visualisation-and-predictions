// Monte Carlo adapter, L9: BTC, LTC and DOGE prices are random (drawn on the same days). LTC and DOGE rewards in USD
// follow their prices. Catch-up model: each path's Scrypt hashrate catches up with that path's LTC + DOGE revenue.
// Fixed growth: Scrypt hashrate follows the revenue-weighted LTC/DOGE price with a lag and the sensitivity (lk).
const MC_ASSETS = ['btc', 'ltc', 'doge'];
function mcModel(p){
  const s = compute(p), iT = Math.max(0, s.findIndex(r => r.d === TODAY)), L = ALL[ALL.length-1], eff = p.th*p.up*(1-p.fee);
  const ul = new Float64Array(s.length), ug = new Float64Array(s.length), F = future(p, p.sc);
  F.forEach((r, j) => { const i = iT+1+j; if (i < s.length){ ul[i] = r.ml/(r.hl*1e3)*r.l*eff; ug[i] = r.mg/(r.hg*1e3)*r.g*eff; } });
  if (p.q.mode !== 'catch')
    return {s, iT, mined:(i, R, G) => (ul[i]*R[1] + ug[i]*R[2])*Math.pow(L.sd*G[2] + (1-L.sd)*G[1], -p.k)/(s[i].price*R[0])};
  const ku = 1 - Math.pow(.5, 1/p.q.up), kd = 1 - Math.pow(.5, 1/p.q.down);
  let x = 0;
  return {s, iT, mined:(i, R) => { const j = i-iT-1, r = F[j]; if (!j) x = r.lf;
    const m = (ul[i]*R[1] + ug[i]*R[2])*Math.exp(r.lf - x)/(s[i].price*R[0]);
    const y = NET_GAP + r.lrr + p.q.c*(j+1)/365.25 + Math.log(r.sd*R[2] + (1-r.sd)*R[1]);
    x += (y - x)*(y > x ? ku : kd); return m; }};
}
