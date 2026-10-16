// Monte Carlo adapter, S21 XP: the BTC price is the only random price. Network hashrate follows the price
// with a lag: hashrate x (lagged price / scenario price)^MC_KB, so mined BTC per day moves the other way.
const MC_ASSETS = ['btc'], MC_KB = 0.5;
function mcModel(p){
  const s = compute(p), iT = Math.max(0, s.findIndex(r => r.d === TODAY));
  return {s, iT, mined:(i, R, G) => s[i].mined*Math.pow(G[0], -MC_KB)};
}
