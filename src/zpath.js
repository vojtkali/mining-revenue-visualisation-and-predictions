/* ZEC price path of a scenario (main calculator, FAQ and Monte Carlo of Z15 Pro), given AGAINST BTC: the ZEC/BTC
 * rate follows the scenario and the USD price is that times the BTC path.
 *
 * "pump" (default): the course of ZEC/BTC after past pumps of mined coins against BTC (LTC 2017, DOGE 2018, DOGE 2021,
 * DOGE 2024, ZEC 2021; see the Metodika). Anchored at the top of ZEC/BTC in the last year of data; the rate is a share
 * of the top 3 months, 6 months, 1 year and 2 years after it (k3 also holds at 6 months: the echo), then a yearly
 * trend against BTC. From today's rate the path goes log-linearly to the next point still ahead.
 * "pct": ZEC/BTC changes in the first year by z1, then by z2 a year.
 *
 * zRatio(z1, z2, rb) gives t => ZEC price in USD on day t / today's price, with BTC +rb a year; z1 is a number (pct)
 * or {k3, k12, k24} (pump), z2 the yearly rate against BTC after the first year (pct) or after 2 years from the top.
 */
const ZPEAK = (() => { const L = ALL[ALL.length-1], from = addDays(L.d, -365);
  const top = ALL.filter(r => r.d >= from).reduce((a, r) => r.z/r.p > a.z/a.p ? r : a, L);
  return {d:top.d, z:top.z, r:top.z/top.p}; })();
const ZPEAK_AGE = daysBetween(ZPEAK.d, ALL[ALL.length-1].d);
function zRatio(z1, z2, rb=0){
  const btc = t => Math.pow(1+rb, t/365);
  if (typeof z1 !== 'object')
    return t => Math.pow(1+z1, Math.min(t,365)/365)*Math.pow(1+z2, Math.max(0,t-365)/365)*btc(t);
  const L = ALL[ALL.length-1], tr = Math.log(1+Math.max(-.95, z2));
  // points as (days from today, ln of price / today's); the first is today
  const pts = [[0, 0]];
  for (const [d, k] of [[90, z1.k3], [180, z1.k3], [365, z1.k12], [730, z1.k24]])
    if (d > ZPEAK_AGE) pts.push([d - ZPEAK_AGE, Math.log(Math.max(1e-6, k)*ZPEAK.r/(L.z/L.p))]);
  const [tl, yl] = pts[pts.length-1];
  return t => {
    if (t >= tl) return Math.exp(yl + tr*(t-tl)/365)*btc(t);
    let i = 1; while (pts[i][0] < t) i++;
    const [t0, y0] = pts[i-1], [t1, y1] = pts[i];
    return Math.exp(y0 + (y1-y0)*(t-t0)/(t1-t0))*btc(t);
  };
}
// a scenario's ZEC path from the inputs: shape select + ids {z1, z2} (pct) and {k3, k12, k24, tr} (pump)
function zScenIn(shapeId, ids){
  const v = (id, d=0) => { const e = document.getElementById(id); const x = e ? parseFloat(e.value) : NaN; return Number.isFinite(x) ? x/100 : d; };
  const pump = (document.getElementById(shapeId)?.value || 'pump') === 'pump';
  return pump ? {z1:{k3:Math.max(.001, v(ids.k3)), k12:Math.max(.001, v(ids.k12)), k24:Math.max(.001, v(ids.k24))}, z2:Math.max(-.9, v(ids.tr))}
              : {z1:Math.max(-.95, v(ids.z1)), z2:Math.max(-.9, v(ids.z2))};
}
const zPctTxt = v => `${v<0?'−':'+'}${Math.abs(Math.round(v*100))} %`;
// short description of a path: pump "ZEC/BTC rok po vrcholu 40 % vrcholu, za 2 roky 25 %, pak −15 % ročně"
const zPathTxt = (z1, z2) => typeof z1 !== 'object' ? `ZEC vůči BTC ${zPctTxt(z1)}, pak ${zPctTxt(z2)} ročně`
  : `ZEC vůči BTC rok po vrcholu ${Math.round(z1.k12*100)} % vrcholu, za 2 roky ${Math.round(z1.k24*100)} %, pak ${zPctTxt(z2)} ročně`;
