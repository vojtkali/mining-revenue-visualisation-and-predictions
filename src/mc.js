/* Monte Carlo of the projection and the "Horská dráha" (calculators only). Appended to a main app's scope after
 * its adapter (mc_<stroj>.js: MC_ASSETS, mcModel(p) -> {s, iT, mined(i, R, G)}); MCR holds the historical daily
 * log returns (x 1e5) of those assets on the same days.
 *
 * A path = the selected scenario path x random noise. The noise is the cumulative sum of historical daily log
 * returns, demeaned, drawn in blocks of MC_BLOCK consecutive days (all assets from the same days, so their
 * co-movement and streaks stay) and scaled by the volatility input. The median path therefore follows the
 * scenario; swings, fat tails and correlation come from history. R = price / scenario price per asset,
 * G = R smoothed over ~MC_LAG days (what the network hashrate reacts to).
 * Accounting is the same as the strategy table: the same deposits on the same days (machine + a year of energy at
 * delivery, then energy every 365 days); spot buys at each deposit, DCA spreads it over 53 weekly buys.
 * History up to the last data day is the same for every path. */
const MC_N = 2000, MC_BLOCK = 60, MC_LAG = 90, MC_SEED = 20261016, MC_CHUNK = 250;
const MC_R = MC_ASSETS.map(a => { const x = MCR[a], m = x.reduce((t, v) => t+v, 0)/x.length; return Float64Array.from(x, v => (v-m)/1e5); });
const MC_LEN = MC_R[0].length;
const MC_NAMES = ['Těžba + držení', 'Těžba + prodej', 'Spot při ročních vkladech', 'Týdenní DCA'];
let MC = null, MC_JOB = 0, MC_T = 0, mcCharts = [], MC_RIDE = 'mid';

function mcRng(seed){ let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 >>> 0; let t = a;
  t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0)/4294967296; }; }
function mcVol(){ const v = parseFloat($('mcVol')?.value); return isNaN(v) ? 1 : Math.max(0, Math.min(300, v))/100; }
const mcInputs = () => [...document.querySelectorAll('#f input, #f select, #fx input, #fx select')].map(i => i.value).join('|');

function mcPrep(p){
  const M = mcModel(p), s = M.s, n = s.length, iT = M.iT, elecDay = p.w/1000*24*p.kwh*p.up;
  const cmp = Economics.compare(s, {hw:p.hw, elecDay, energyGrowth:energyGrowth()});
  const inv = Float64Array.from(cmp, c => c.invested), cash = Float64Array.from(cmp, c => c.cash), alloc = new Float64Array(n), spend = new Float64Array(n);
  for (let i = 0; i < n; i++){ alloc[i] = inv[i] - (i ? inv[i-1] : 0); spend[i] = (i ? cash[i-1] : 0) + alloc[i] - cash[i]; }
  const pts = []; for (let i = 0; i < n; i += 7) pts.push(i); if (pts[pts.length-1] !== n-1) pts.push(n-1);
  // history: drawdown of value per deposited dollar (deposits alone do not count as gains), first payback day
  const h = {pk:[0, 0, 0], dd:[0, 0, 0], pay:[-1, -1]};
  for (let i = 0; i <= iT; i++){
    const I = inv[i], v = [s[i].stack, cmp[i].spotValue, cmp[i].dcaValue];
    for (let a = 0; a < 3; a++){ const m = I > 0 ? v[a]/I : 0; if (m > h.pk[a]) h.pk[a] = m; else if (h.pk[a] > 0) h.dd[a] = Math.min(h.dd[a], m/h.pk[a]-1); }
    if (h.pay[0] < 0 && v[0] >= I) h.pay[0] = i; if (h.pay[1] < 0 && s[i].rev >= I) h.pay[1] = i;
  }
  return {p, vol:mcVol(), M, s, n, iT, cmp, inv, cash, alloc, spend, pts, jT:pts.findIndex(i => i > iT), h};
}

// one path; S = weekly samples of all paths, F = full daily series of this path (Horská dráha)
function mcPath(P, k, S, F){
  const {s, n, iT, inv, cash, alloc, spend, vol, M, h, pts} = P, A = MC_R.length, rnd = mcRng(MC_SEED + k*7919);
  const noise = new Float64Array(A), R = new Float64Array(A).fill(1), G = new Float64Array(A).fill(1);
  let b = s[iT].btc, rev = s[iT].rev, spot = P.cmp[iT].spot, dca = P.cmp[iT].dca;
  let pkH = h.pk[0], pkS = h.pk[1], pkD = h.pk[2], ddH = h.dd[0], ddS = h.dd[1], ddD = h.dd[2], payH = h.pay[0], payL = h.pay[1];
  let u = 0, left = 0, j = P.jT, vh = s[iT].stack, vs = P.cmp[iT].spotValue, vd = P.cmp[iT].dcaValue;
  for (let i = iT+1; i < n; i++){
    if (!left){ u = Math.floor(rnd()*MC_LEN); left = MC_BLOCK; }   // circular blocks: every day is drawn equally often
    for (let a = 0; a < A; a++){ noise[a] += vol*MC_R[a][u]; R[a] = Math.exp(noise[a]); G[a] += (R[a] - G[a])/MC_LAG; }
    if (++u === MC_LEN) u = 0; left--;
    const price = s[i].price*R[0], mined = M.mined(i, R, G), I = inv[i];
    b += mined; rev += mined*price;
    if (alloc[i]) spot += alloc[i]/price;
    if (spend[i]) dca += spend[i]/price;
    vh = b*price; vs = spot*price; vd = dca*price + cash[i];
    if (I > 0){
      let m = vh/I; if (m > pkH) pkH = m; else if (pkH > 0 && m/pkH-1 < ddH) ddH = m/pkH-1;
      m = vs/I; if (m > pkS) pkS = m; else if (pkS > 0 && m/pkS-1 < ddS) ddS = m/pkS-1;
      m = vd/I; if (m > pkD) pkD = m; else if (pkD > 0 && m/pkD-1 < ddD) ddD = m/pkD-1;
    }
    if (payH < 0 && vh >= I) payH = i; if (payL < 0 && rev >= I) payL = i;
    if (S && i === pts[j]){ const o = j*MC_N + k; S.H[o] = vh; S.L[o] = rev; S.S[o] = vs; S.D[o] = vd; j++; }
    if (F){ F.H[i] = vh; F.L[i] = rev; F.S[i] = vs; F.D[i] = vd; F.P[i] = price; }
  }
  return {v:[vh, rev, vs, vd], dd:[ddH, null, ddS, ddD], payH, payL, rB:R[0]};
}

const mcQ = (sorted, f) => { const x = f*(sorted.length-1), i = Math.floor(x), w = x-i; return sorted[i] + (i+1 < sorted.length ? (sorted[i+1]-sorted[i])*w : 0); };
function mcAggregate(P, S, res){
  const {pts, jT, s, cmp, n} = P, QS = [.1, .25, .5, .75, .9], tmp = new Float64Array(MC_N);
  const band = {}, win = [];
  const hist = {H:i => s[i].stack, L:i => s[i].rev, S:i => cmp[i].spotValue, D:i => cmp[i].dcaValue};
  for (const key of ['H', 'L', 'S', 'D', 'X']){
    band[key] = QS.map(() => new Array(pts.length));
    pts.forEach((i, j) => {
      if (j < jT || jT < 0){ const v = key === 'X' ? hist.H(i) - hist.S(i) : hist[key](i); QS.forEach((_, q) => band[key][q][j] = v); return; }
      const o = j*MC_N;
      for (let k = 0; k < MC_N; k++) tmp[k] = key === 'X' ? S.H[o+k] - S.S[o+k] : S[key][o+k];
      if (key === 'X'){ let c = 0; for (let k = 0; k < MC_N; k++) if (tmp[k] > 0) c++; win[j] = c/MC_N; }
      tmp.sort(); QS.forEach((f, q) => band[key][q][j] = mcQ(tmp, f));
    });
  }
  const I = P.inv[n-1], sortQ = arr => { const a = Float64Array.from(arr).sort(); return f => mcQ(a, f); };
  const strat = MC_NAMES.map((name, a) => {
    const v = res.map(r => r.v[a]), q = sortQ(v), dd = a === 1 ? null : sortQ(res.map(r => r.dd[a]));
    const best = res.filter(r => r.v.every((x, b) => x <= r.v[a])).length/MC_N;
    return {name, q10:q(.1), q50:q(.5), q90:q(.9), loss:v.filter(x => x < I).length/MC_N, best, dd50:dd && dd(.5), dd10:dd && dd(.1)};
  });
  const share = f => res.filter(f).length/MC_N;
  const payCdf = key => pts.map(i => share(r => r[key] >= 0 && r[key] <= i));
  const payQ = key => { const d = res.map(r => r[key] < 0 ? Infinity : r[key]).sort((x, y) => x-y); return d[Math.floor(MC_N/2)]; };
  const order = res.map((r, k) => k).sort((x, y) => res[x].rB - res[y].rB);
  return {P, band, win, strat, I, res, order,
    holdSpot:share(r => r.v[0] > r.v[2]), holdDca:share(r => r.v[0] > r.v[3]), dcaSpot:share(r => r.v[3] > r.v[2]),
    payH:payCdf('payH'), payL:payCdf('payL'), payMedH:payQ('payH'), payMedL:payQ('payL'),
    paidEndH:share(r => r.v[0] >= I), hodl:sortQ(res.map(r => r.v[0] - (I - P.p.hw)))};
}

const mcSigned = x => Math.round(x).toLocaleString('cs-CZ').replace('-', '−') + ' %';
const mcPct = x => x > 0 && x < .005 ? '< 1 %' : x < 1 && x > .995 ? '> 99 %' : Math.round(x*100).toLocaleString('cs-CZ') + ' %';
function mcStatus(t){ const e = $('mcStat'); if (e) e.textContent = t; }
function mcSchedule(){
  if (!$('mc')) return;
  const key = mcInputs();
  if (MC && MC.key === key){ mcDraw(); return; }
  mcStatus('Počítám 2 000 cest…'); mcDecorate();
  const job = ++MC_JOB; clearTimeout(MC_T); MC_T = setTimeout(() => mcRun(key, job), 150);
}
function mcRun(key, job){
  if (job !== MC_JOB) return;
  const P = mcPrep(params()), np = P.pts.length, t0 = performance.now(), res = new Array(MC_N);
  const S = {H:new Float32Array(np*MC_N), L:new Float32Array(np*MC_N), S:new Float32Array(np*MC_N), D:new Float32Array(np*MC_N)};
  let k = 0;
  (function chunk(){
    if (job !== MC_JOB) return;
    for (const stop = Math.min(MC_N, k + MC_CHUNK); k < stop; k++) res[k] = mcPath(P, k, S);
    if (k < MC_N){ mcStatus(`Počítám 2 000 cest… ${Math.round(k/MC_N*100)} %`); setTimeout(chunk, 0); return; }
    MC = mcAggregate(P, S, res); MC.key = key; MC.ms = performance.now() - t0; mcDraw();
  })();
}

// weekly labels: one tick per month (or quarter / half-year when the range is long)
function mcTicks(o){
  o.scales.x.ticks.callback = function(v){
    const Ls = this.chart.data.labels, d = Ls[v], pr = Ls[v-1]; if (!v || !d || pr.slice(0, 7) === d.slice(0, 7)) return null;
    const m = +d.slice(5, 7), months = Ls.length*7/30.4, per = months/Math.max(1, this.chart.width/48), step = per > 3 ? 6 : per > 1.5 ? 3 : per > .7 ? 2 : 1;
    if ((m-1) % step) return null; return m === 1 ? d.slice(0, 4) : MONTHS[m-1];
  };
  return o;
}
const mcBand = (label, lo, hi, col, a) => [
  line(label + ' dolní', lo, 'transparent', {borderWidth:0, pointHoverRadius:0, mcBand:true}),
  line(label, hi, 'transparent', {borderWidth:0, pointHoverRadius:0, fill:'-1', backgroundColor:col + a, mcBand:true})];
const mcRange = (lo, hi, f) => `${f(lo)} až ${f(hi)}`;

function mcDraw(){
  mcCharts.forEach(c => c.destroy()); mcCharts = [];
  if (!MC) return;
  const {P, band, strat} = MC, L = P.pts.map(i => P.s[i].d), endD = fmtDate(P.s[P.n-1].d), scen = SC[P.p.sc][0].toLowerCase();
  mcStatus(`${MC_N.toLocaleString('cs-CZ')} cest, ${scen} scénář, kolísání ${Math.round(P.vol*100)} % historického; spočteno za ${Math.max(1, Math.round(MC.ms)).toLocaleString('cs-CZ')} ms.`);
  const H = strat[0], Sp = strat[2], D = strat[3];
  $('mcKpis').innerHTML = [
    ['Těžba + držení porazí spot', mcPct(MC.holdSpot), `podíl cest, ve kterých má těžba ${endD} vyšší hodnotu než jednorázové nákupy`, MC.holdSpot - .5],
    ['Těžba + držení porazí DCA', mcPct(MC.holdDca), `podíl cest k ${endD}`, MC.holdDca - .5],
    ['DCA porazí spot', mcPct(MC.dcaSpot), 'rozložení nákupů pomáhá hlavně v cestách s propadem během roku'],
    ['Těžba + držení: 80 % cest', mcRange(H.q10, H.q90, yUsd), `medián ${usd(H.q50)}; vloženo ${usd(MC.I)}`],
  ].map(([l, v, sub, sg]) => `<div class="kpi"><div class="l">${l}</div><div class="v ${sg === undefined ? '' : sg >= 0 ? 'pos' : 'neg'}">${v}</div><div class="s">${sub}</div></div>`).join('');

  const inv = P.pts.map(i => P.inv[i]);
  const o1 = mcTicks(opts(yUsd, v => usd(v)));
  o1.plugins.tooltip.filter = it => !it.dataset.mcBand;
  o1.plugins.tooltip.callbacks.label = it => { const j = it.dataIndex, b = it.dataset.mcKey;
    return b ? ` ${it.dataset.label}: ${usd(it.parsed.y)} (80 %: ${mcRange(band[b][0][j], band[b][4][j], yUsd)})` : ` ${it.dataset.label}: ${usd(it.parsed.y)}`; };
  mcCharts.push(new Chart($('mcV'), {type:'line', plugins:[zones, crosshair], options:o1, data:{labels:L, datasets:[
    ...mcBand('Spot 10–90 %', band.S[0], band.S[4], css('--s2'), '26'),
    ...mcBand('Těžba 10–90 %', band.H[0], band.H[4], css('--s1'), '26'),
    line('Těžba + držení, medián', band.H[2], css('--s1'), {mcKey:'H'}),
    line('Spot, medián', band.S[2], css('--s2'), {mcKey:'S'}),
    line('DCA, medián', band.D[2], css('--s3'), {mcKey:'D', borderDash:[6, 4], borderWidth:1.75}),
    ref('Vloženo', inv)]}}));

  const o2 = mcTicks(opts(yUsd, v => usd(v)));
  o2.plugins.tooltip.filter = it => !it.dataset.mcBand;
  o2.plugins.tooltip.callbacks.afterBody = it => { const j = it[0].dataIndex; return MC.win[j] === undefined ? [] :
    [` 80 % cest: ${mcRange(band.X[0][j], band.X[4][j], yUsd)}`, ` Těžba vede v ${mcPct(MC.win[j])} cest`]; };
  mcCharts.push(new Chart($('mcX'), {type:'line', plugins:[zones, crosshair], options:o2, data:{labels:L, datasets:[
    ...mcBand('10–90 %', band.X[0], band.X[4], css('--s1'), '1c'),
    ...mcBand('25–75 %', band.X[1], band.X[3], css('--s1'), '30'),
    line('Těžba minus spot, medián', band.X[2], css('--s1')),
    ref('Stejný výsledek', L.map(() => 0))]}}));

  const f = x => x === null ? '—' : mcSigned(x*100);
  $('mcTab').innerHTML = `<thead><tr><th>Strategie ${endD}</th><th>Vloženo</th><th>10. percentil</th><th>Medián</th><th>90. percentil</th><th>Pod vklady</th><th>Nejlepší ze čtyř</th><th>Největší propad: medián</th><th>Propad v horších 10 % cest</th></tr></thead><tbody>` +
    strat.map(r => `<tr><td>${r.name}</td><td>${usd(MC.I)}</td><td class="${r.q10 >= MC.I ? 'pos' : 'neg'}">${usd(r.q10)}</td><td>${usd(r.q50)}</td><td>${usd(r.q90)}</td><td>${mcPct(r.loss)}</td><td>${mcPct(r.best)}</td><td>${f(r.dd50)}</td><td>${f(r.dd10)}</td></tr>`).join('') + '</tbody>';
  mcPayDraw(L);
  mcRideDraw();
  mcDecorate();
}

// Návratnost tab: share of paths in which the machine has been paid back (held BTC or sold daily) by each date
function mcPayDraw(L){
  if (!$('mcPayC')) return;
  const {P} = MC, n = P.n, endD = fmtDate(P.s[n-1].d), half = i => i === Infinity ? `ve více než polovině cest se nezaplatí ani do ${endD}` : `polovina cest do <b>${fmtDate(P.s[i].d)}</b>`;
  const o = mcTicks(opts(v => v + ' %', v => v.toLocaleString('cs-CZ', {maximumFractionDigits:0}) + ' % cest'));
  o.scales.y.min = 0; o.scales.y.max = 100;
  mcCharts.push(new Chart($('mcPayC'), {type:'line', plugins:[zones, crosshair], options:o, data:{labels:L, datasets:[
    line('Držení BTC', MC.payH.map(x => x*100), css('--s1')), line('Průběžný prodej', MC.payL.map(x => x*100), css('--s4'), {borderDash:[6, 4], borderWidth:1.75})]}}));
  const years = []; for (let y = 1; y*365 < n; y++) years.push([`${y}. rok`, y*365 - 1]); years.push([`Konec odhadu`, n-1]);
  const share = (key, i) => mcPct(MC.res.filter(r => r[key] >= 0 && r[key] <= i).length/MC_N);
  $('mcPayTab').innerHTML = '<thead><tr><th>Zaplaceno do</th><th>Držení BTC</th><th>Průběžný prodej</th></tr></thead><tbody>' +
    years.map(([t, i]) => `<tr><td>${t}: ${fmtDate(P.s[i].d)}</td><td>${share('payH', i)}</td><td>${share('payL', i)}</td></tr>`).join('') + '</tbody>';
  $('mcPayTxt').innerHTML = `Při držení BTC je stroj zaplacený do ${endD} v <b class="n">${mcPct(MC.payH.at(-1))}</b> cest, ${half(MC.payMedH)}. ` +
    `Při průběžném prodeji v <b class="n">${mcPct(MC.payL.at(-1))}</b> cest, ${half(MC.payMedL)}. Na konci odhadu je při držení nad vklady ${mcPct(MC.paidEndH)} cest: po zaplacení může hodnota BTC zase klesnout pod vklady.`;
}

// Přehled: the end-of-projection and payback tiles get the Monte Carlo range
function mcDecorate(){
  const tiles = document.querySelectorAll('#kpis .kpi .s'); if (tiles.length < 6) return;
  tiles.forEach(t => t.querySelector('.mc')?.remove());
  const add = (t, html) => { const e = document.createElement('span'); e.className = 'mc'; e.innerHTML = html; t.append(e); };
  if (!MC || MC.key !== mcInputs()){ add(tiles[3], '<br>Monte Carlo: počítám…'); return; }
  add(tiles[3], `<br>Monte Carlo: po odečtení energie v 80 % cest ${mcRange(MC.hodl(.1), MC.hodl(.9), yUsd)}`);
  add(tiles[5], `<br>Monte Carlo: při držení aspoň jednou zaplaceno v ${mcPct(MC.payH.at(-1))} cest, na konci nad vklady v ${mcPct(MC.paidEndH)}`);
}

// Horská dráha: one path in full, daily, with the value of every strategy and its drop from the high
function mcRidePick(){
  const o = MC.order, at = f => o[Math.min(MC_N-1, Math.floor(f*MC_N))];
  return MC_RIDE === 'low' ? at(.1) : MC_RIDE === 'high' ? at(.9) : MC_RIDE === 'rnd' ? (MC.rnd ?? (MC.rnd = Math.floor(Math.random()*MC_N))) : at(.5);
}
function mcRideDraw(){
  if (!$('rideV')) return;
  const {P} = MC, {s, n, iT, cmp, inv} = P, k = mcRidePick();
  const F = {H:new Float64Array(n), L:new Float64Array(n), S:new Float64Array(n), D:new Float64Array(n), P:new Float64Array(n)};
  for (let i = 0; i <= iT; i++){ F.H[i] = s[i].stack; F.L[i] = s[i].rev; F.S[i] = cmp[i].spotValue; F.D[i] = cmp[i].dcaValue; F.P[i] = s[i].price; }
  mcPath(P, k, null, F);
  const L = s.map(r => r.d), keys = [['H', 'Těžba + držení', '--s1'], ['S', 'Spot (jednorázové nákupy)', '--s2'], ['D', 'Týdenní DCA', '--s3']];
  const dd = {}, stats = keys.map(([key, name]) => {
    let pk = 0, low = Infinity, lowI = 0, under = 0, worst = 0, worstI = 0; const fall = new Array(n);
    for (let i = 0; i < n; i++){
      const v = F[key][i], I = inv[i], m = I > 0 ? v/I : 0; if (m > pk) pk = m;
      fall[i] = pk > 0 ? (m/pk - 1)*100 : 0; if (fall[i] < worst){ worst = fall[i]; worstI = i; }
      if (v - I < low){ low = v - I; lowI = i; } if (v < I) under++;
    }
    dd[key] = fall; return {name, end:F[key][n-1], res:F[key][n-1] - inv[n-1], worst, worstI, low, lowI, under};
  });
  document.querySelectorAll('#rideSel button').forEach(b => b.setAttribute('aria-pressed', b.dataset.r === MC_RIDE));
  const o = opts(yUsd, v => usd(v));
  o.plugins.tooltip.callbacks.afterBody = it => [` Cena BTC: ${usd(F.P[it[0].dataIndex])}`];
  mcCharts.push(new Chart($('rideV'), {type:'line', plugins:[zones, crosshair], options:o, data:{labels:L, datasets:
    keys.map(([key, name, col]) => line(name, Array.from(F[key]), css(col), key === 'D' ? {borderDash:[6, 4], borderWidth:1.75} : {})).concat([ref('Vloženo', Array.from(inv))])}}));
  const o2 = opts(v => v.toLocaleString('cs-CZ') + ' %', v => v.toLocaleString('cs-CZ', {maximumFractionDigits:0}) + ' %');
  o2.scales.y.max = 0;
  mcCharts.push(new Chart($('rideD'), {type:'line', plugins:[zones, crosshair], options:o2, data:{labels:L, datasets:
    keys.map(([key, name, col]) => line(name + ': pod maximem', dd[key], css(col), key === 'D' ? {borderDash:[6, 4], borderWidth:1.75} : {}))}}));
  const pB = F.P[n-1]/s[n-1].price;
  $('rideTxt').textContent = `Cesta č. ${k+1}: cena BTC ${fmtDate(L[n-1])} ${usd(F.P[n-1])}, to je ${pB >= 1 ? '+' : '−'}${Math.abs(Math.round((pB-1)*100)).toLocaleString('cs-CZ')} % proti scénáři (${usd(s[n-1].price)}).`;
  $('rideTab').innerHTML = '<thead><tr><th>Strategie</th><th>Hodnota na konci</th><th>Výsledek proti vkladům</th><th>Největší propad od maxima</th><th>Nejhůř proti vkladům</th><th>Dní pod vklady</th></tr></thead><tbody>' +
    stats.map(r => `<tr><td>${r.name}</td><td>${usd(r.end)}</td><td class="${r.res >= 0 ? 'pos' : 'neg'}">${usd(r.res)}</td><td>${mcSigned(r.worst)}${r.worst < 0 ? ', ' + fmtDate(L[r.worstI]) : ''}</td><td>${usd(r.low)}, ${fmtDate(L[r.lowI])}</td><td>${r.under.toLocaleString('cs-CZ')} z ${n.toLocaleString('cs-CZ')}</td></tr>`).join('') + '</tbody>';
}

if ($('mc')){
  document.querySelectorAll('#f input, #f select, #fx input, #fx select').forEach(i => i.addEventListener('input', mcSchedule));
  new MutationObserver(mcSchedule).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', mcSchedule);
  document.querySelectorAll('#rideSel button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.r === 'rnd' && MC) MC.rnd = Math.floor(Math.random()*MC_N);
    MC_RIDE = b.dataset.r; if (MC){ mcDraw(); }
  }));
  mcSchedule();
}
