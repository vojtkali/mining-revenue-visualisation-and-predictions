// Monte Carlo adapter, Z15 Pro: BTC and ZEC prices are random (drawn on the same days). Mined BTC scales with
// ZEC/BTC; Zcash hashrate follows the ZEC price with a lag and the sensitivity from the panel (zk).
const MC_ASSETS = ['btc', 'zec'];
function mcModel(p){
  const s = compute(p), iT = Math.max(0, s.findIndex(r => r.d === TODAY));
  return {s, iT, mined:(i, R, G) => s[i].mined*R[1]/R[0]*Math.pow(G[1], -p.k)};
}
