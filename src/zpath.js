/* ZEC price path of a scenario (main calculator, FAQ and Monte Carlo of Z15 Pro).
 *
 * "pump" (default): the course after past pumps of mined coins (LTC 2017, DOGE 2017/18, DOGE 2021, DOGE 2024, see
 * scripts/pump_network_test.py and the Metodika). Anchored at the top of the last year in the data; the price is a
 * share of the top 3 months, 6 months, 1 year and 2 years after it (k3 also holds at 6 months: the echo), then a
 * yearly trend. From today's price the path goes log-linearly to the next point still ahead.
 * "pct": the first year a change in %, then a yearly rate.
 *
 * zRatio(z1, z2) gives t => ZEC price on day t / today's price; z1 is a number (pct) or {k3, k12, k24} (pump),
 * z2 is the yearly rate after the first year (pct) or after 2 years from the top (pump).
 */
const ZPEAK = (() => { const L = ALL[ALL.length-1], from = addDays(L.d, -365);
  return ALL.filter(r => r.d >= from).reduce((a, r) => r.z > a.z ? r : a, L); })();
const ZPEAK_AGE = daysBetween(ZPEAK.d, ALL[ALL.length-1].d);
function zRatio(z1, z2){
  if (typeof z1 !== 'object')
    return t => Math.pow(1+z1, Math.min(t,365)/365)*Math.pow(1+z2, Math.max(0,t-365)/365);
  const L = ALL[ALL.length-1], tr = Math.log(1+Math.max(-.95, z2));
  // points as (days from today, ln of price / today's); the first is today
  const pts = [[0, 0]];
  for (const [d, k] of [[90, z1.k3], [180, z1.k3], [365, z1.k12], [730, z1.k24]])
    if (d > ZPEAK_AGE) pts.push([d - ZPEAK_AGE, Math.log(Math.max(1e-6, k)*ZPEAK.z/L.z)]);
  const [tl, yl] = pts[pts.length-1];
  return t => {
    if (t >= tl) return Math.exp(yl + tr*(t-tl)/365);
    let i = 1; while (pts[i][0] < t) i++;
    const [t0, y0] = pts[i-1], [t1, y1] = pts[i];
    return Math.exp(y0 + (y1-y0)*(t-t0)/(t1-t0));
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
// short description of a path: pump "po vrcholu $1 653: za rok 15 % vrcholu ($248), dál +0 % ročně"
const zPathTxt = (z1, z2) => typeof z1 !== 'object' ? `ZEC ${zPctTxt(z1)}, pak ${zPctTxt(z2)} ročně`
  : `ZEC po vrcholu $${Math.round(ZPEAK.z).toLocaleString('cs-CZ')}: za rok ${Math.round(z1.k12*100)} % vrcholu ($${Math.round(z1.k12*ZPEAK.z).toLocaleString('cs-CZ')}), za 2 roky ${Math.round(z1.k24*100)} %, pak ${zPctTxt(z2)} ročně`;
