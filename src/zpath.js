/* ZEC price path of a scenario (main calculator, FAQ and Monte Carlo of Z15 Pro), given AGAINST BTC: the ZEC/BTC
 * rate follows the scenario and the USD price is that times the BTC path.
 *
 * Scenario: the change of ZEC/BTC against today after 3 months, 1 year and 2 years ({k3, k12, k24}, e.g. -0.5),
 * log-linear in between, then a yearly rate z2 against BTC. The defaults follow the course of past pumps of mined
 * coins against BTC (see the Metodika): a fast fall in the first months, then slower.
 * A number z1 instead: ZEC/BTC changes by z1 in the first year, then by z2 a year (FAQ and "what would have to happen").
 *
 * zRatio(z1, z2, rb) gives t => ZEC price in USD on day t / today's price, with BTC +rb a year.
 */
function zRatio(z1, z2, rb=0){
  const btc = t => Math.pow(1+rb, t/365);
  if (typeof z1 !== 'object')
    return t => Math.pow(1+z1, Math.min(t,365)/365)*Math.pow(1+z2, Math.max(0,t-365)/365)*btc(t);
  const tr = Math.log(1+Math.max(-.95, z2)), lv = x => Math.log(Math.max(.001, 1+x));
  const pts = [[0, 0], [90, lv(z1.k3)], [365, lv(z1.k12)], [730, lv(z1.k24)]], [tl, yl] = pts[pts.length-1];
  return t => {
    if (t >= tl) return Math.exp(yl + tr*(t-tl)/365)*btc(t);
    let i = 1; while (pts[i][0] < t) i++;
    const [t0, y0] = pts[i-1], [t1, y1] = pts[i];
    return Math.exp(y0 + (y1-y0)*(t-t0)/(t1-t0))*btc(t);
  };
}
// a scenario's ZEC path from the inputs {k3, k12, k24, tr} (changes against BTC in %)
function zScenIn(ids){
  const v = id => { const e = document.getElementById(id); const x = e ? parseFloat(e.value) : NaN; return Number.isFinite(x) ? x/100 : 0; };
  const c = id => Math.max(-.99, v(id));
  return {z1:{k3:c(ids.k3), k12:c(ids.k12), k24:c(ids.k24)}, z2:Math.max(-.9, v(ids.tr))};
}
const zPctTxt = v => `${v<0?'−':'+'}${Math.abs(Math.round(v*100))} %`;
// short description of a path: "ZEC vůči BTC za 3 měsíce −40 %, za rok −50 %, za 2 roky −65 %, pak −15 % ročně"
const zPathTxt = (z1, z2) => typeof z1 !== 'object' ? `ZEC vůči BTC ${zPctTxt(z1)}, pak ${zPctTxt(z2)} ročně`
  : `ZEC vůči BTC za 3 měsíce ${zPctTxt(z1.k3)}, za rok ${zPctTxt(z1.k12)}, za 2 roky ${zPctTxt(z1.k24)}, pak ${zPctTxt(z2)} ročně`;
