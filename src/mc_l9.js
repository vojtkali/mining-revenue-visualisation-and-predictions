// Monte Carlo adapter, L9: BTC, LTC and DOGE prices are random (drawn on the same days). LTC and DOGE rewards
// in USD follow their prices; Scrypt hashrate follows the revenue-weighted LTC/DOGE price with a lag and the
// sensitivity from the panel (lk), on both chains, as in the deterministic projection.
const MC_ASSETS = ['btc', 'ltc', 'doge'];
function mcModel(p){
  const s = compute(p), iT = Math.max(0, s.findIndex(r => r.d === TODAY)), L = ALL[ALL.length-1], eff = p.th*p.up*(1-p.fee);
  const ul = new Float64Array(s.length), ug = new Float64Array(s.length);
  future(p, p.sc).forEach((r, j) => { const i = iT+1+j; if (i < s.length){ ul[i] = r.ml/(r.hl*1e3)*r.l*eff; ug[i] = r.mg/(r.hg*1e3)*r.g*eff; } });
  return {s, iT, mined:(i, R, G) => (ul[i]*R[1] + ug[i]*R[2])*Math.pow(L.sd*G[2] + (1-L.sd)*G[1], -p.k)/(s[i].price*R[0])};
}
