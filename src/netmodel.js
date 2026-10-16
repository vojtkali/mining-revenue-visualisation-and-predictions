/* Network hashrate in the projections (shared by the calculators, the FAQ pages and the Monte Carlo).
 *
 * "catch" (default): the hashrate catches up with the hashrate that the miners' revenue can carry at a normal
 * hashprice. Target ln H* = ln(revenue in USD a day) - ln(normal hashprice), the normal hashprice falls by c a year
 * (machines get more efficient). Each day the gap closes with half-life `up` days while the network is below the
 * target (machines must be built and plugged in) and `down` days while above it (machines keep running as long
 * as they pay for power). Calibrated on 2017-2026 by scripts/catchup_hashrate.py (DATA.net), editable in the panel.
 * "fixed": the old fixed yearly growth g (Z15 Pro and L9 add their price sensitivity themselves).
 *
 * The app supplies how its data rows give the network revenue (USD a day) and hashrate in Coin Metrics units.
 */
const NETM = DATA.net || null;
// ln(target / actual) on the last data day, from 30-day means as in the calibration
function netGap(revOf, hrOf){
  if (!NETM) return 0;
  const rows = ALL.slice(-30), mean = f => rows.reduce((s, r) => s + f(r), 0)/rows.length;
  const lhpNow = NETM.lhp - NETM.c*Math.round((Date.parse(ALL[ALL.length-1].d) - Date.parse(NETM.ref))/864e5)/365.25;
  return Math.log(mean(revOf)/mean(hrOf)) - lhpNow;
}
// model parameters from a page's inputs (ids: mode select, half-lives in days, efficiency % a year)
function netQ(ids, g){
  const v = id => { const e = document.getElementById(id); return e ? e.value : undefined; };
  const num = (id, d) => { const x = parseFloat(v(id)); return Number.isFinite(x) ? x : d; };
  const mode = !NETM ? 'fixed' : (v(ids.mode) || 'catch');
  return {mode, g, up:Math.max(1, num(ids.up, NETM?.up ?? 270)), down:Math.max(1, num(ids.down, NETM?.down ?? 2920)), c:num(ids.c, (NETM?.c ?? .2)*100)/100};
}
// hashrate relative to today for t = 0..N; lrr(t) = ln(network revenue on day t / today's), gap = netGap(...)
function netPath(N, lrr, q, gap){
  const f = new Float64Array(N+1);
  if (q.mode !== 'catch'){ for (let t=0; t<=N; t++) f[t] = Math.pow(1+q.g, t/365); return f; }
  const ku = 1 - Math.pow(.5, 1/q.up), kd = 1 - Math.pow(.5, 1/q.down);
  let x = 0;
  for (let t=0; t<=N; t++){
    f[t] = Math.exp(x);
    const y = gap + lrr(t) + q.c*t/365.25;
    x += (y - x)*(y > x ? ku : kd);
  }
  return f;
}
const netTxt = q => q.mode === 'catch' ? `síť dohání tržby (poločas ${Math.round(q.up/30.4)} měs.)` : `síť ${q.g<0?'−':'+'}${Math.abs(Math.round(q.g*100))} % ročně`;
