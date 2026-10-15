/* "What would have to happen for mining to beat spot / DCA" (FAQ, Z15 Pro and L9).
 * Included into a FAQ app's scope; uses its Chart helpers (opts, line, ref, crosshair, zones, charts,
 * css, usd, btc, kfmt, yUsd). Each condition is moved on its own, everything else stays as set on the left;
 * the result is the value after 5 years of the same deposits: mining + holding, spot, weekly DCA.
 *
 * S = {sim(o) -> {mine, spot, dca, btcM, btcS, btcD, out, cmp}, o0, scLabel,
 *      LV: {key: {n, cur, set(o,x), min, max, step, dir:'nad'|'pod' (direction that helps mining), fx, ax, fx2?}},
 *      VAR: [{t, key, base, m}], combo: {t, base, text}}
 */
let EDGE_S = null, EDGE_T = 0;
function edgeSchedule(S){
  EDGE_S = S;
  const host = document.getElementById('edge'); if (!host) return;
  const panel = host.closest?.('[role=tabpanel]');
  host.dataset.dirty = '1';
  if (panel && panel.hidden) return;   // heavy: computed only when its tab is visible
  clearTimeout(EDGE_T); EDGE_T = setTimeout(() => edgeRender(EDGE_S), 250);
}
(() => { const h = document.getElementById('edge'), pn = h?.closest?.('[role=tabpanel]');
  if (!pn || typeof MutationObserver === 'undefined') return;
  new MutationObserver(() => { if (!pn.hidden && h.dataset.dirty === '1' && EDGE_S) edgeSchedule(EDGE_S); }).observe(pn, {attributes:true, attributeFilter:['hidden']}); })();

function edgeRender(S){
  const host = document.getElementById('edge'); if (!host) return;
  host.dataset.dirty = '';
  const {sim, o0, LV, VAR, combo, scLabel} = S;
  const run = (base, L, x) => { const o = {...o0, ...base}; if (L) L.set(o, x); return sim(o); };
  // threshold of one condition against spot or DCA: search from today's value in the direction that
  // changes the leader (expanding steps, then bisection); null when the range ends first
  const cross = (L, base, k) => {
    const f = x => { const r = run(base, L, x); return r.mine - r[k]; };
    const lead = f(L.cur) >= 0, up = (L.dir === 'nad') !== lead, end = up ? L.max : L.min;
    let a = L.cur, b = a, step = L.step;
    for (let i = 0; i < 60; i++){
      b = up ? Math.min(end, a + step) : Math.max(end, a - step);
      if ((f(b) >= 0) !== lead) break;
      if (b === end) return {x:null, lead, lim:end};
      a = b; step *= 1.6;
    }
    for (let i = 0; i < 30; i++){ const m = (a + b)/2; if ((f(m) >= 0) === lead) a = m; else b = m; }
    return {x:(a + b)/2, lead};
  };
  const low = t => t.charAt(0).toLowerCase() + t.slice(1), over = {spot:'spotem', DCA:'DCA'};
  const verdict = (L, c, who) => {
    if (c.x === null) return c.lead ? `těžba vede nad ${over[who]} v celém rozsahu (do ${L.fx(c.lim)})` : `těžba ${who} nepředstihne ani při ${L.fx(c.lim)}`;
    const v = `<b class="n">${L.fx(c.x)}</b>${L.fx2 ? L.fx2(c.x) : ''}`;
    return c.lead ? `těžba vede nad ${over[who]}, dokud ${low(L.n)} nebude ${L.dir === 'nad' ? 'pod' : 'nad'} ${v}`
                  : `těžba ${who} předstihne ${L.dir} ${v}`;
  };
  const sweep = (key, base) => {
    const L = LV[key], cs = cross(L, base, 'spot'), cd = cross(L, base, 'dca');
    const pts = [L.cur, cs.x, cd.x].filter(x => x !== null);
    let lo = Math.min(...pts), hi = Math.max(...pts);
    if (hi - lo < L.step*4){ lo -= L.step*2; hi += L.step*2; }
    const pad = (hi - lo)*.2; lo = Math.max(L.min, lo - pad); hi = Math.min(L.max, hi + pad);
    const xs = Array.from({length:17}, (_, i) => lo + (hi - lo)*i/16);
    return {L, cs, cd, xs, ys:xs.map(x => run(base, L, x))};
  };
  const now = sim(o0);
  const lead = now.mine >= Math.max(now.spot, now.dca);
  let html = `<p>Výchozí stav (scénář <b>${scLabel}</b>, stroj koupený dnes, 5 let, stejné vklady ve stejných dnech): těžba <span class="n">${usd(now.mine)}</span> (${btc(now.btcM)}), spot <span class="n">${usd(now.spot)}</span> (${btc(now.btcS)}), DCA <span class="n">${usd(now.dca)}</span> (${btc(now.btcD)}). ${lead ? 'Těžba už teď vede; tabulka proto ukazuje i to, kdy by vést přestala.' : 'Těžba zatím prohrává; tabulka ukazuje, co by se muselo změnit.'}</p>
  <p><b>Jedna podmínka sama o sobě.</b> Ostatní parametry zůstávají podle panelu vlevo:</p>`;
  const singles = Object.keys(LV).map(k => ({L:LV[k], cs:cross(LV[k], {}, 'spot'), cd:cross(LV[k], {}, 'dca')}));
  html += '<div class="tbl"><table><thead><tr><th>Podmínka</th><th>Dnes</th><th>Těžba vs. spot</th><th>Těžba vs. DCA</th></tr></thead><tbody>' +
    singles.map(s => `<tr><td>${s.L.n}</td><td>${s.L.fx(s.L.cur)}</td><td style="white-space:normal">${verdict(s.L, s.cs, 'spot')}</td><td style="white-space:normal">${verdict(s.L, s.cd, 'DCA')}</td></tr>`).join('') +
    '</tbody></table></div><p style="margin-top:10px">Níže varianty, ve kterých se několik podmínek sejde najednou. U každé je dopočtená hranice jedné podmínky a graf: hodnota po 5 letech pro těžbu, spot a DCA podle této podmínky, svislá čárkovaná čára je dnešní hodnota. Zbytková hodnota stroje po 5 letech se nepočítá, pokud to varianta neuvádí.</p>';
  const desc = b => Object.entries(b).map(([k, x]) => LV[k] ? `${low(LV[k].n)} ${LV[k].fx(x)}` : '').filter(Boolean).join(', ');
  const vres = VAR.map(v => ({v, s:sweep(v.key, v.base)}));
  vres.forEach(({v, s}, i) => {
    html += `<p style="margin-top:16px"><b>${i+1}. ${v.t}</b></p>
      <p>${Object.keys(v.base).length ? `Předpoklady: ${desc(v.base)}; ostatní podle panelu. ` : ''}Podmínka (${low(s.L.n)}): ${verdict(s.L, s.cs, 'spot')}; ${verdict(s.L, s.cd, 'DCA')}. Dnes: ${s.L.fx(s.L.cur)}.</p>
      <p>Co by se na trhu muselo dít: ${v.m}</p>
      <div class="legend"><span><i style="background:var(--s1)"></i>Těžba + držení</span><span><i style="background:var(--s2)"></i>Spot při ročních vkladech</span><span><i style="background:var(--s3)"></i>Týdenní DCA</span><span><i class="dash"></i>Dnes</span><span><i class="box" style="background:color-mix(in srgb, var(--good) 18%, transparent)!important"></i>Zelená zóna: těžba vede nad spotem</span></div>
      <div class="chart small"><canvas id="edge${i}" aria-label="${v.t}: hodnota po 5 letech"></canvas></div>`;
  });
  const cb = sim({...o0, ...combo.base});
  const best = cb.mine >= Math.max(cb.spot, cb.dca) ? 'těžba' : cb.spot >= cb.dca ? 'spot' : 'DCA';
  html += `<p style="margin-top:16px"><b>${VAR.length+1}. ${combo.t}</b></p>
    <p>Předpoklady: ${desc(combo.base)}, cena BTC podle scénáře <b>${scLabel}</b>. Po 5 letech: těžba <span class="n">${usd(cb.mine)}</span> (${btc(cb.btcM)}), spot <span class="n">${usd(cb.spot)}</span> (${btc(cb.btcS)}), DCA <span class="n">${usd(cb.dca)}</span> (${btc(cb.btcD)}). Vychází nejlépe: <b>${best}</b>.</p>
    <p>${combo.text} Graf ukazuje počet BTC v čase.</p>
    <div class="legend"><span><i style="background:var(--s1)"></i>Těžba</span><span><i style="background:var(--s2)"></i>Spot při ročních vkladech</span><span><i style="background:var(--s3)"></i>Týdenní DCA</span></div>
    <div class="chart small"><canvas id="edgeC" aria-label="${combo.t}: BTC v čase"></canvas></div>`;
  host.innerHTML = html;

  vres.forEach(({s}, i) => {
    const L = s.L, o = opts(yUsd, x => usd(x)), all = s.ys.flatMap(y => [y.mine, y.spot, y.dca]), lo = Math.min(...all), hi = Math.max(...all);
    o.scales.x = {type:'linear', min:s.xs[0], max:s.xs.at(-1), grid:{display:false}, border:{color:css('--line')}, ticks:{color:css('--fg2'), maxTicksLimit:8, font:{family:'IBM Plex Mono', size:11}, callback:x => L.ax(x)}};
    o.plugins.tooltip.callbacks.title = it => `${L.n}: ${L.fx(it[0].parsed.x)}`;
    o.plugins.tooltip.filter = it => it.dataset.label !== 'Dnes';
    const pts = k => s.xs.map((x, j) => ({x, y:s.ys[j][k]}));
    // shade where mining beats spot, mark both thresholds
    const zone = {id:'edgeZone', beforeDatasetsDraw(c){
      const {ctx, chartArea:a, scales:{x}} = c, help = L.dir === 'nad'; ctx.save();
      s.ys.forEach((y, j) => { if (y.mine < y.spot) return;
        const x0 = x.getPixelForValue(j ? (s.xs[j-1] + s.xs[j])/2 : s.xs[0]), x1 = x.getPixelForValue(j < s.xs.length-1 ? (s.xs[j] + s.xs[j+1])/2 : s.xs[j]);
        ctx.fillStyle = css('--good'); ctx.globalAlpha = .08; ctx.fillRect(x0, a.top, x1 - x0, a.bottom - a.top); });
      ctx.globalAlpha = 1; ctx.font = '600 11px "IBM Plex Sans", sans-serif'; ctx.fillStyle = css('--good'); ctx.strokeStyle = css('--good'); ctx.setLineDash([2,3]);
      [[s.cs.x, 'těžba = spot', 14], [s.cd.x, 'těžba = DCA', 28]].forEach(([v, t, dy]) => { if (v === null) return; const px = x.getPixelForValue(v); if (px < a.left-1 || px > a.right+1) return;
        ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.stroke();
        const w = ctx.measureText(t).width, tx = help ? px + 5 : px - w - 5; ctx.fillText(t, Math.max(a.left+2, Math.min(a.right-w-2, tx)), a.top + dy); });
      ctx.restore(); }};
    charts.push(new Chart(document.getElementById('edge' + i), {type:'line', plugins:[crosshair, zone], options:o, data:{datasets:[
      line('Těžba', pts('mine'), css('--s1')), line('Spot', pts('spot'), css('--s2')), line('DCA', pts('dca'), css('--s3')),
      ref('Dnes', [{x:L.cur, y:lo}, {x:L.cur, y:hi}])]}}));
  });
  charts.push(new Chart(document.getElementById('edgeC'), {type:'line', plugins:[zones, crosshair], options:opts(v => v.toLocaleString('cs-CZ', {maximumFractionDigits:3}), v => btc(v)), data:{labels:cb.out.map(o => o.d), datasets:[
    line('Těžba', cb.out.map(o => o.btc), css('--s1')), line('Spot', cb.cmp.map(o => o.spot), css('--s2')), line('DCA', cb.cmp.map(o => o.dca), css('--s3'))]}}));
}
