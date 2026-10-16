const ALL = DATA.rows, CM_END = DATA.cmEnd;
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const usd = (v, d=0) => (v<0?'−':'') + '$' + Math.abs(v).toLocaleString('cs-CZ',{maximumFractionDigits:d,minimumFractionDigits:d});
const btc = v => v.toLocaleString('cs-CZ',{minimumFractionDigits:4,maximumFractionDigits:4}) + ' BTC';
const fmtDate = s => { const [y,m,d]=s.split('-'); return `${+d}. ${+m}. ${y}`; };
const MONTHS=['led','úno','bře','dub','kvě','čvn','čvc','srp','zář','říj','lis','pro'];
let charts = [];



const L0 = ALL[ALL.length-1], TODAY = L0.d;
const HALVINGS = ['2028-04-10', '2032-04-10', '2036-04-10', '2040-04-10', '2044-04-10'];
const NEXT_HALVING = HALVINGS.find(d=>d>TODAY);
const subsidy = d => 3.125/Math.pow(2, HALVINGS.filter(h => d >= h).length);
function addDays(s,n){ const d=new Date(s+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
const daysBetween = (a,b) => Math.round((Date.parse(b)-Date.parse(a))/864e5);
const pct = (v, d=0) => v===null ? '—' : (v*100).toLocaleString('cs-CZ',{maximumFractionDigits:d}) + ' %';
const sats = v => Math.round(v*1e8).toLocaleString('cs-CZ') + ' sats';
const yrs = d => { const y = d/365; return y < 1 ? `${Math.round(d/30.4)} měsíců` : `${y.toLocaleString('cs-CZ',{minimumFractionDigits:1,maximumFractionDigits:1})} roku`; };
const TH = 270, W = 3645, FEE0 = (L0.fee ?? Math.max(0, L0.hv*L0.hr*1e6/144 - subsidy(L0.d)));   // BTC fees per block today

function P(){
  const n = id => Math.max(0, parseFloat($(id).value) || 0);
  const g = (parseFloat($('fHg').value)||0)/100;
  return {price:n('fPrice')||L0.p, kwh:n('fKwh'), fee:Math.min(.9,n('fFee')/100), up:Math.min(1,n('fUp')/100), hw:n('fHwS'), g, g0:g,
          q:netQ({mode:'fNetMode', up:'fNetUp', down:'fNetDown', c:'fNetEff'}, g)};
}
/*@include netmodel.js*/
const NET_GAP = netGap(r => r.hv*r.hr*1e6*r.p, r => r.hr*1e6);
// daily BTC per TH for the network state t days from today
let FEE_MUL = 1, FEE_SPIKE = null;   // FEE_SPIKE = {from, to, mul}: temporary fee mania   // multiplier on today's block fees, used by the "what would have to happen" variants
const feeAt = d => FEE0*FEE_MUL*(FEE_SPIKE && d>=FEE_SPIKE.from && d<FEE_SPIKE.to ? FEE_SPIKE.mul : 1);
const hvAt = (d, f) => 144*(subsidy(d)+feeAt(d))/(L0.hr*1e6*f);   // f = network hashrate relative to today
// network hashrate over N days for a BTC price path (r a year from p.price): the catch-up model, or fixed growth g
// when the model is switched off or a "what would have to happen" variant sets the growth itself
function netF(p, r, N, g=p.g){
  const q = (p.gFixed || g !== p.g0) ? {mode:'fixed', g} : {...p.q, g};
  return netPath(N, t => { const d = addDays(TODAY, t);
    return Math.log((subsidy(d)+feeAt(d))/(subsidy(TODAY)+FEE0)) + Math.log(p.price/L0.p) + t/365*Math.log(1+r); }, q, NET_GAP);
}
const gEff = f => Math.pow(f[f.length-1], 365/(f.length-1)) - 1;   // average yearly network growth of a path

// ---- "what would have to happen for mining to beat spot / DCA" ----
// Each variant moves one condition (others stay as set on the left) and compares 5-year end values of the same deposits.
function edgeSim(p, r, feeMul=1, spike=null, resale=0){
  FEE_MUL = feeMul; FEE_SPIKE = spike; const pr = proj(p, r); FEE_MUL = 1; FEE_SPIKE = null;
  const cmp = Economics.compare(pr.out, {hw:p.hw, elecDay:pr.elec, energyGrowth:energyGrowth()}), c = cmp.at(-1);
  return {mine:pr.end.stack+resale*p.hw, spot:c.spotValue, dca:c.dcaValue, btcM:pr.btc, btcS:c.spot, btcD:c.dca, out:pr.out, cmp};
}
function edgeCross(xs, ys, key){
  // first x where mining value reaches the other strategy, linear interpolation between grid points
  for (let i=0;i<ys.length;i++){ const d = ys[i].mine-ys[i][key];
    if (d >= 0){ if (i===0) return xs[0]; const d0 = ys[i-1].mine-ys[i-1][key]; return xs[i-1] + (xs[i]-xs[i-1])*(-d0)/(d-d0); } }
  return null;
}
let EDGE_ARGS = null, EDGE_T = 0;
function renderEdge(p, r, scLabel){
  EDGE_ARGS = [p, r, scLabel];
  const host = document.getElementById('edge'); if (!host) return;
  const panel = host.closest?.('[role=tabpanel]');
  host.dataset.dirty = '1';
  if (panel && panel.hidden) return;   // heavy: computed only when its tab is visible
  clearTimeout(EDGE_T); EDGE_T = setTimeout(renderEdgeNow, 250);   // let the other charts paint first, coalesce typing
}
function renderEdgeNow(){
  const [p, r, scLabel] = EDGE_ARGS, host = document.getElementById('edge');
  host.dataset.dirty = '';
  const n1 = v => v.toLocaleString('cs-CZ',{maximumFractionDigits:1}), n3 = v => v.toLocaleString('cs-CZ',{maximumFractionDigits:3});
  const sgn = v => (v<0?'−':'+')+n1(Math.abs(v));
  const money = x => '$'+Math.round(x).toLocaleString('cs-CZ');
  const range = (a,b,s) => { const o=[]; for (let v=a; v<=b+1e-9; v+=s) o.push(+v.toFixed(6)); return o; };
  const sim = o => { const {r:rr, fm, sp, rs, ...pp} = o; return edgeSim(pp, rr, fm, sp, rs||0); };
  // grid that ends a bit past the spot threshold, so the chart shows the crossing
  const autoGrid = (L, base) => { const diff = x => { const o = {...o0, ...base}; L.set(o,x); const r_ = sim(o); return r_.mine-r_.spot; };
    let lo = L.x0 ?? 1, hi = Math.max(2, lo+10); while (diff(hi) < 0 && hi < L.ext) { lo = hi; hi *= 2; }
    for (let i=0; i<25; i++){ const m = (lo+hi)/2; if (diff(m) >= 0) hi = m; else lo = m; }
    const top = Math.ceil(hi*1.15/10)*10, n = 14; L.xs = Array.from({length:n+1}, (_,i) => i===0 ? (L.x0 ?? 1) : Math.round(top*i/n)); };   // May 2023 ordinals/BRC-20 peak: 6.66 BTC fees per block on average (Glassnode via ForkLog)
  const o0 = {...p, r, fm:1};
  // levers: how to set them, grid, which direction helps mining
  const LV = {
    kwh:  {n:'Cena elektřiny', cur:p.kwh, set:(o,x)=>{o.kwh=x}, xs:range(0,Math.max(.1,p.kwh),.005), dir:'pod', fx:x=>n3(x)+' USD/kWh', ax:x=>n3(x)},
    g:    {n:'Růst hashrate sítě', cur:(p.q.mode==='catch' ? gEff(netF(p, r, 1826)) : p.g)*100, set:(o,x)=>{o.g=x/100; o.gFixed=true}, xs:range(-40,Math.max(60,p.g*100),5), dir:'pod', fx:x=>sgn(x)+' % ročně', ax:x=>sgn(x)+' %', ext:-95},
    hw:   {n:'Cena stroje', cur:p.hw, set:(o,x)=>{o.hw=x}, xs:range(0,Math.max(p.hw,1000),Math.max(250,Math.round(p.hw/16/50)*50)), dir:'pod', fx:money, ax:x=>'$'+kfmt(x)},
    fee:  {n:'Poplatek poolu', cur:p.fee*100, set:(o,x)=>{o.fee=x/100}, xs:range(0,Math.max(30,p.fee*100),2), dir:'pod', fx:x=>n1(x)+' %', ax:x=>n1(x)+' %'},
    fm:   {n:'Transakční poplatky v bloku', cur:1, set:(o,x)=>{o.fm=x}, xs:[1,10,25,50,75,100,125,150,175,200,210,220,230,250], dir:'nad', fx:x=>n1(x)+'× dnešek', ax:x=>Math.round(x)+'×', ext:1e5, fx2:x=>` (≈ ${n1(x*FEE0)} BTC poplatků na blok proti dnešním ${n3(FEE0)} BTC)`},
    up:   {n:'Uptime', cur:p.up*100, set:(o,x)=>{o.up=x/100}, xs:range(80,100,2), dir:'nad', fx:x=>n1(x)+' %', ax:x=>n1(x)+' %'},
    price:{n:'Cena BTC v den nákupu', cur:p.price, set:(o,x)=>{o.price=x}, xs:range(Math.round(p.price*.4/10000)*10000,Math.round(p.price*4/10000)*10000,10000), dir:'nad', fx:money, ax:x=>'$'+kfmt(x), ext:p.price*1000},
    sp:   {n:'Transakční poplatky od halvingu 2028', cur:1, set:(o,x)=>{o.sp = x!==1 ? {from:NEXT_HALVING, to:'2999-01-01', mul:x} : null}, xs:null, auto:true, dir:'nad', fx:x=>n1(x)+'× dnešek', ax:x=>Math.round(x)+'×', ext:1e5, fx2:x=>` (≈ ${n1(x*FEE0)} BTC poplatků na blok od halvingu)`},
    rs:   {n:'Prodej stroje na konci 5 let', cur:0, x0:0, set:(o,x)=>{o.rs=x/100}, xs:null, auto:true, dir:'nad', fx:x=>`${Math.round(x)} % nákupní ceny`, ax:x=>Math.round(x)+' %', ext:1e5, fx2:x=>` (≈ ${money(x/100*p.hw)})`},
    r:    {n:'Růst ceny BTC', cur:r*100, set:(o,x)=>{o.r=x/100}, xs:range(-30,150,15), dir:'nad', fx:x=>sgn(x)+' % ročně', ax:x=>sgn(x)+' %', ext:5000},
  };
  const sweep = (key, base) => { const L = LV[key]; if (L.auto && !L.xs) autoGrid(L, base); const ys = L.xs.map(x => { const o = {...o0, ...base}; L.set(o,x); return sim(o); });
    const flip = L.dir==='pod', xsS = flip ? L.xs.slice().reverse() : L.xs, ysS = flip ? ys.slice().reverse() : ys;
    const out = {L, ys, cs:edgeCross(xsS, ysS, 'spot'), cd:edgeCross(xsS, ysS, 'dca'), lim:xsS.at(-1)};
    // beyond the chart range: search outward, then bisect, so the table gives an exact threshold
    if (L.ext!==undefined) ['spot','dca'].forEach(k => { const ck = k==='spot'?'cs':'cd'; if (out[ck]!==null) return;
      const diff = x => { const o = {...o0, ...base}; L.set(o,x); const r_ = sim(o); return r_.mine-r_[k]; };
      let lo = out.lim, hi = lo, found = false;
      for (let i=0; i<40; i++){ hi = flip ? Math.max(L.ext, lo-Math.max(5,Math.abs(lo))) : Math.min(L.ext, Math.max(lo*2, lo+10));
        if (diff(hi) >= 0){ found = true; break; } if (hi===L.ext) break; lo = hi; }
      if (!found){ out[ck+'Lim'] = L.ext; return; }
      for (let i=0; i<30; i++){ const m = (lo+hi)/2; if (diff(m) >= 0) hi = m; else lo = m; }
      out[ck] = hi; });
    return out; };
  const verdict = (s, c, who) => {
    if (c===null) return `těžba ${who} nepředstihne ani při ${s.L.fx(s[(who==='spot'?'cs':'cd')+'Lim'] ?? s.lim)}`;
    const ok = s.L.dir==='pod' ? s.L.cur<=c : s.L.cur>=c;
    return ok ? `těžba ${who} vede už při dnešní hodnotě` : `těžba ${who} předstihne ${s.L.dir} <b class="n">${s.L.fx(c)}</b>${s.L.fx2?s.L.fx2(c):''}`; };
  const now = sim(o0);

  let html = `<p>Výchozí stav (scénář <b>${scLabel}</b>, stroj koupený dnes, 5 let, stejné vklady ve stejných dnech): těžba <span class="n">${usd(now.mine)}</span> (${btc(now.btcM)}), spot <span class="n">${usd(now.spot)}</span> (${btc(now.btcS)}), DCA <span class="n">${usd(now.dca)}</span> (${btc(now.btcD)}). ${now.mine>=Math.max(now.spot,now.dca)?'Těžba už teď vede.':`Těžba za spotem zaostává o <span class="n">${usd(now.spot-now.mine)}</span>. Vytěžený BTC vás stojí asi <span class="n">${usd((p.hw+edgeSim(p,r).out.at(-1).el)/now.btcM)}</span>, na burze dnes <span class="n">${usd(p.price)}</span>.`}</p>
  <p><b>Jedna podmínka sama o sobě.</b> Ostatní parametry zůstávají podle panelu vlevo:</p>`;
  const singles = Object.keys(LV).map(k => sweep(k, {}));
  html += `<div class="tbl"><table><thead><tr><th>Podmínka</th><th>Dnes</th><th>Těžba vs. spot</th><th>Těžba vs. DCA</th></tr></thead><tbody>`+
    singles.map(s=>`<tr><td>${s.L.n}</td><td>${s.L.fx(s.L.cur)}</td><td style="white-space:normal">${verdict(s,s.cs,'spot')}</td><td style="white-space:normal">${verdict(s,s.cd,'DCA')}</td></tr>`).join('')+`</tbody></table></div>
  <p style="margin-top:10px">Proto níže varianty, ve kterých se několik podmínek sejde najednou. Poplatek poolu ve všech zůstává podle panelu vlevo. U každé je dopočtená hranice jedné podmínky a graf: hodnota po 5 letech pro těžbu, spot a DCA podle této podmínky, svislá čárkovaná čára je dnešní hodnota. Zbytková hodnota stroje po 5 letech se nepočítá.</p>`;

  const VAR = [
    {t:'Síť přestane růst a začne se zmenšovat', key:'g', base:{},
     m:'Dlouhý medvědí trh nebo halving 2028 bez růstu ceny: starší a dražší mineři vypínají, hashrate sítě rok po roce klesá a každý zbývající stroj dostává větší podíl odměn. Historicky se to dělo jen krátkodobě (Čína 2021, kapitulace 2022), ne několik let po sobě.'},
    {t:'Nákup mineru ve chvíli, kdy je BTC drahý', key:'price', base:{},
     m:'Cena BTC vystřelí, ale síť ještě nedohnala růst (nové stroje se vyrábějí a instalují měsíce). Spot za stejné peníze koupí málo BTC, kdežto těžba vytěží stejné množství. Okno trvá typicky jen několik měsíců, pak síť doroste.'},
    {t:'Levná elektřina (0,03 USD/kWh) a pomalejší síť', key:'g', base:{kwh:.03},
     m:'Hosting na levném zdroji (vlastní FVE s přebytky, hydro, spalování odpadního plynu, Skandinávie, Paraguay, Etiopie) a k tomu období, kdy síť roste pomalu nebo se zmenšuje: po halvingu 2028 odcházejí slabší mineři, nové ASICy jsou drahé nebo regulace omezí těžbu ve velkých zemích.'},
    {t:'Elektřina 0,05 USD/kWh, síť stagnuje a levnější stroj', key:'hw', base:{kwh:.05, g:0},
     m:'Dostupná cena energie jako u středně velkých farem, síť přestane růst (medvědí trh, kapitulace minerů) a stroj se prodává výrazně levněji, typicky právě v takovém medvědím trhu, kdy ceny ASICů padají o 50–80 %.'},
    {t:'Trvale vyšší transakční poplatky', key:'fm', base:{},
     m:`Dlouhodobě zahlcená síť: mánie v bull marketu, nové využití bloků (inscriptions, tokeny, L2 settlement) nebo masové používání. Poplatky pak tvoří velkou část odměny za blok, kterou dostávají jen mineři. <b>Kdy už byly poplatky takhle vysoko:</b> v květnu 2023 (ordinals, BRC-20) dosáhl průměr 6,66 BTC na blok a poprvé od roku 2017 převýšil odměnu za blok (6,25 BTC); trvalo to několik dní. Na halving 20. 4. 2024 (spuštění Runes) šlo v prvním bloku na poplatky 37,7 BTC, po zhruba 200 blocích byly zpět na běžné úrovni. Trvale na takové úrovni poplatky nikdy nebyly (zdroje: Glassnode přes ForkLog, Cointelegraph).`},
    {t:'Vyšší transakční poplatky od halvingu 2028', key:'sp', base:{},
     m:`Do halvingu v dubnu 2028 zůstávají poplatky na dnešní úrovni (${n3(FEE0)} BTC na blok), od halvingu do konce pětiletého období jsou trvale vyšší. Odměna za blok po halvingu klesne na 1,5625 BTC, takže poplatky by musely tvořit většinu příjmu minerů. Pro srovnání: v květnu 2023 (ordinals, BRC-20) dosáhl průměr 6,66 BTC na blok, ale jen na několik dní, a na halving 2024 šlo v prvním bloku 37,7 BTC, po zhruba 200 blocích se poplatky vrátily k normálu (zdroje: Glassnode přes ForkLog, Cointelegraph). Hranice je vyšší než u varianty „Trvale vyšší transakční poplatky“ od dneška, protože první 1,5 roku se nic nemění a síť mezitím poroste.`},
    {t:'Prodej stroje za vyšší cenu, než stál', key:'rs', base:{},
     m:'Ceny ASICů se odvíjejí od hashprice. V bull marketu, kdy cena BTC předběhne růst sítě a nové stroje nejsou k dostání, se použité stroje prodávají i za násobek původní ceny. V medvědím trhu naopak za zlomek. Výpočet: stroj po 5 letech těžby prodáte za zvolené procento nákupní ceny a výnos připočtete k hodnotě vytěžených BTC. Pozor: po 5 letech a jednom halvingu je stroj technologicky zastaralý, takže vysoká prodejní cena je realistická spíš při dřívějším prodeji. Ten ale zkrátí dobu těžby.'},
    {t:'Prodej stroje, elektřina 0,05 USD/kWh a síť +15 % ročně', key:'rs', base:{kwh:.05, g:.15},
     m:'Kombinace dostupné ceny energie, polovičního tempa růstu sítě a prodeje stroje v příznivém trhu. Spekulace na cenu stroje tu doplňuje výnos z těžby.'},
    {t:'Elektřina 0,03 USD/kWh, stroj za 4 000 USD a růst sítě', key:'g', base:{kwh:.03, hw:4000},
     m:'Levná energie i levný stroj. Pak rozhoduje už jen to, jak rychle síť poroste: čím pomaleji, tím víc BTC stroj vytěží.'},
  ];
  const vres = VAR.map(v => ({v, s:sweep(v.key, v.base)}));
  const desc = b => Object.entries(b).map(([k,x]) => k==='fee'?`pool ${n1(x*100)} %`:k==='kwh'?`elektřina ${n3(x)} USD/kWh`:k==='g'?`síť ${sgn(x*100)} % ročně`:k==='hw'?`stroj ${money(x)}`:'').filter(Boolean).join(', ');
  vres.forEach(({v,s},i) => {
    html += `<p style="margin-top:16px"><b>${i+1}. ${v.t}</b></p>
      <p>${Object.keys(v.base).length?`Předpoklady: ${desc(v.base)}; ostatní podle panelu. `:''}Podmínka (${s.L.n.charAt(0).toLowerCase()+s.L.n.slice(1)}): ${verdict(s,s.cs,'spot')}; ${verdict(s,s.cd,'DCA')}. Dnes: ${s.L.fx(s.L.cur)}.</p>
      <p>Co by se na trhu muselo dít: ${v.m}</p>
      <div class="legend"><span><i style="background:var(--s1)"></i>Těžba + držení</span><span><i style="background:var(--s2)"></i>Spot při ročních vkladech</span><span><i style="background:var(--s3)"></i>Týdenní DCA</span><span><i class="dash"></i>Dnes</span><span><i class="box" style="background:color-mix(in srgb, var(--good) 18%, transparent)!important"></i>Zelená zóna: těžba vede</span></div>
      <div class="chart small"><canvas id="edge${i}" aria-label="${v.t}: hodnota po 5 letech"></canvas></div>`;
  });
  const cb = {kwh:.03, g:0, fm:3, hw:Math.min(p.hw,5000)}, combo = sim({...o0, ...cb});
  const best = combo.mine>=Math.max(combo.spot,combo.dca) ? 'těžba' : combo.spot>=combo.dca ? 'spot' : 'DCA';
  html += `<p style="margin-top:16px"><b>${VAR.length+1}. Souhra všeho: levná energie, levnější stroj, stagnující síť, rušný mempool</b></p>
    <p>Předpoklady: elektřina 0,03 USD/kWh, stroj ${money(cb.hw)}, síť 0 % ročně, transakční poplatky 3× vyšší než dnes, poplatek poolu podle panelu (${n1(p.fee*100)} %), cena BTC podle scénáře <b>${scLabel}</b>. Po 5 letech: těžba <span class="n">${usd(combo.mine)}</span> (${btc(combo.btcM)}), spot <span class="n">${usd(combo.spot)}</span> (${btc(combo.btcS)}), DCA <span class="n">${usd(combo.dca)}</span> (${btc(combo.btcD)}). Nejlépe vychází <b>${best}</b>.</p>
    <p>Co by se na trhu muselo dít: levný zdroj energie a cenu stroje lze ovlivnit. Stagnující síť a vyšší poplatky zároveň nastávají jen výjimečně, například když po halvingu odcházejí slabší mineři a současně roste využití sítě. Graf ukazuje počet BTC v čase.</p>
    <div class="legend"><span><i style="background:var(--s1)"></i>Těžba</span><span><i style="background:var(--s2)"></i>Spot při ročních vkladech</span><span><i style="background:var(--s3)"></i>Týdenní DCA</span></div>
    <div class="chart small"><canvas id="edgeC" aria-label="Souhra podmínek: BTC v čase"></canvas></div>`;
  host.innerHTML = html;

  vres.forEach(({v,s}, i) => {
    const L = s.L, o = opts(yUsd, x=>usd(x)), all = s.ys.flatMap(y=>[y.mine,y.spot,y.dca]), lo = Math.min(...all), hi = Math.max(...all);
    o.scales.x = {type:'linear', min:L.xs[0], max:L.xs.at(-1), grid:{display:false}, border:{color:css('--line')}, ticks:{color:css('--fg2'), maxTicksLimit:8, font:{family:'IBM Plex Mono',size:11}, callback:x=>L.ax(x)}};
    o.plugins.tooltip.callbacks.title = it => `${L.n}: ${L.fx(it[0].parsed.x)}`;
    o.plugins.tooltip.filter = it => it.dataset.label!=='Dnes';
    const pts = k => L.xs.map((x,j)=>({x, y:s.ys[j][k]}));
    // shade the side of the axis where mining beats spot, mark both crossing points
    const zone = {id:'edgeZone', beforeDatasetsDraw(c){
      const {ctx, chartArea:a, scales:{x}} = c; ctx.save();
      const side = (v, alpha) => { if (v===null) return; const px = x.getPixelForValue(v);
        ctx.fillStyle = css('--good'); ctx.globalAlpha = alpha;
        if (L.dir==='pod') ctx.fillRect(a.left, a.top, Math.max(0,px-a.left), a.bottom-a.top); else ctx.fillRect(px, a.top, Math.max(0,a.right-px), a.bottom-a.top); };
      side(s.cd, .06); side(s.cs, .08); ctx.globalAlpha = 1;
      ctx.font = '600 11px "IBM Plex Sans", sans-serif'; ctx.fillStyle = css('--good'); ctx.strokeStyle = css('--good'); ctx.setLineDash([2,3]);
      [[s.cs,'těžba > spot',14],[s.cd,'těžba > DCA',28]].forEach(([v,t,dy]) => { if (v===null) return; const px = x.getPixelForValue(v); if (px<a.left-1||px>a.right+1) return;
        ctx.beginPath(); ctx.moveTo(px,a.top); ctx.lineTo(px,a.bottom); ctx.stroke();
        const w = ctx.measureText(t).width, tx = L.dir==='pod' ? px-w-5 : px+5; ctx.fillText(t, Math.max(a.left+2, Math.min(a.right-w-2, tx)), a.top+dy); });
      (L.refs||[]).forEach(([v,t]) => { const px = x.getPixelForValue(v); if (px<a.left||px>a.right) return;
        ctx.strokeStyle = css('--s5'); ctx.fillStyle = css('--chipfg'); ctx.setLineDash([6,3]); ctx.beginPath(); ctx.moveTo(px,a.top); ctx.lineTo(px,a.bottom); ctx.stroke();
        const w = ctx.measureText(t).width; ctx.fillText(t, Math.min(a.right-w-2, px+5), a.bottom-8); });
      ctx.restore(); }};
    charts.push(new Chart(document.getElementById('edge'+i), {type:'line', plugins:[crosshair, zone], options:o, data:{datasets:[
      line('Těžba', pts('mine'), css('--s1')), line('Spot', pts('spot'), css('--s2')), line('DCA', pts('dca'), css('--s3')),
      ref('Dnes', [{x:L.cur, y:lo}, {x:L.cur, y:hi}])]}}));
  });
  charts.push(new Chart(document.getElementById('edgeC'), {type:'line', plugins:[zones,crosshair], options:opts(v=>v.toLocaleString('cs-CZ',{maximumFractionDigits:3}), v=>btc(v)), data:{labels:combo.out.map(o=>o.d), datasets:[
    line('Těžba', combo.out.map(o=>o.btc), css('--s1')), line('Spot', combo.cmp.map(o=>o.spot), css('--s2')), line('DCA', combo.cmp.map(o=>o.dca), css('--s3'))]}}));
}
(() => { const h = document.getElementById('edge'), pn = h?.closest?.('[role=tabpanel]'); if (!pn || typeof MutationObserver === 'undefined') return;
  new MutationObserver(() => { if (!pn.hidden && h.dataset.dirty==='1' && EDGE_ARGS) renderEdge(...EDGE_ARGS); }).observe(pn, {attributes:true, attributeFilter:['hidden']}); })();

// machine bought today, run 5 years; price changes r per year
function proj(p, r, years=5, g=p.g){
  const N = Math.round(365*years), eff = TH*p.up*(1-p.fee), elec = W/1000*24*p.kwh*p.up, out = [], f = netF(p, r, N, g);
  let b=0, el=0, rev=0, firstLoss=null, payS=null, payH=null, btcPreH=0;
  for (let t=0; t<N; t++){
    const d = addDays(TODAY, t), pr = p.price*Math.pow(1+r, t/365), m = hvAt(d, f[t])*eff;
    b += m; el += elec; rev += m*pr; if (d < NEXT_HALVING) btcPreH = b;
    if (firstLoss===null && m*pr < elec) firstLoss = d;
    if (payS===null && rev-el >= p.hw) payS = d;
    if (payH===null && b*pr-el >= p.hw) payH = d;
    out.push({d, pr, m, btc:b, el, stack:b*pr, hodl:b*pr-el, sell:rev-el});
  }
  const accounted = Economics.account(out,{hw:p.hw,elecDay:elec,energyGrowth:energyGrowth()});
  firstLoss = accounted.find(o => o.m*o.price < o.elecDay)?.d ?? null;
  payS = accounted.find(o => o.profitSell >= 0)?.d ?? null;
  payH = accounted.find(o => o.profitHold >= 0)?.d ?? null;
  accounted.forEach(o => o.be = o.elecDay/o.m);
  return {out:accounted, btc:b, el:accounted.at(-1).el, elec, end:accounted.at(-1), firstLoss, payS, payH, btcPreH};
}
// break-even over time along the selected scenario: electricity that day (energy price steps yearly) / what the machine
// earns that day with the network grown by g a year (and following the price where the model says so), halvings included
const beSeries = (out, f, dH) => { const pts = [['za rok', 365], ['za 2 roky', 730]];
  if (dH > 0 && dH < out.length) pts.push([`po halvingu ${NEXT_HALVING.slice(0, 4)}`, dH]);
  return pts.filter(([, t]) => t < out.length).sort((a, b) => a[1]-b[1]).map(([l, t]) => `${l} ${f(out[t])}`).join(' · '); };
const sgnPct = v => `${v<0?'−':'+'}${Math.abs(Math.round(v*100)).toLocaleString('cs-CZ')} %`;
// BTC price scenarios; rates come from the yBear/yBase/yBull inputs when the page has them
const SCN_DEF = [['Pesimistický',.10,'--s2','yBear'],['Základní',.20,'--s1','yBase'],['Optimistický',.40,'--s3','yBull']];
const scnNow = () => SCN_DEF.map(([n,r0,col,id]) => { const v = parseFloat(document.getElementById(id)?.value), r = Number.isFinite(v) ? Math.max(-.9, v/100) : r0;
  return [`${n} ${r<0?'−':'+'}${Math.abs(Math.round(r*100))} % ročně`, r, col]; });

function render(){
  const p = P(); charts.forEach(c=>c.destroy()); charts = [];
  const eff = TH*p.up*(1-p.fee), btcDay = L0.hv*eff, revDay = btcDay*p.price, elecDay = W/1000*24*p.kwh*p.up, netDay = revDay-elecDay;
  const M = 30.44, bePrice = elecDay/btcDay;
  const dH = daysBetween(TODAY, NEXT_HALVING), fB = netF(p, scnNow()[+($('fScen3').value||1)][1], Math.max(dH, 365));
  const btcDayH = hvAt(NEXT_HALVING, fB[dH])*eff, btcDay1y = hvAt(addDays(TODAY,365), fB[365])*eff;
  // last 12 months history with current parameters
  const from12 = addDays(TODAY,-365), from6 = addDays(TODAY,-182);
  const H = ALL.filter(r => r.d > from12);
  const hist = H.map(r => { const m = r.hv*eff; return {d:r.d, e:r.e, rev:m*r.p, el:elecDay, net:m*r.p-elecDay, btc:m, hp:r.hv*r.p*1000}; });
  const sum = (a,k) => a.reduce((s,x)=>s+x[k],0);
  const h6 = hist.filter(x=>x.d>from6);
  const hps = hist.map(x=>x.hp), chg = hist.slice(1).map((x,i)=>Math.abs(x.hp/hist[i].hp-1)).sort((a,b)=>a-b);
  const nets = hist.map(x=>x.net);
  const hr12 = ALL.find(r=>r.d===from12) || ALL[0];
  const SCN = scnNow(), sc = SCN.map(([name,r,col]) => ({name,r,col,...proj(p,r)}));
  // payback after the 5-year window: same scenario run up to 15 years, so the tables show an exact date or "ani do <rok>"
  const LONG = 15, longY = +L0.d.slice(0,4) + LONG;
  sc.forEach(x => { if (x.payH && x.payS) return; const q = proj(p, x.r, LONG); x.payH = x.payH || q.payH; x.payS = x.payS || q.payS; });
  const si = +($('fScen3').value||1), base = sc[si];
  const comparison = Economics.compare(base.out,{hw:p.hw,elecDay:base.elec,energyGrowth:energyGrowth()});
  const lump = comparison.at(-1).spot, dcaAcc = comparison.at(-1).dca;
  const dcaS = comparison.map(o=>o.dca), lumpS = comparison.map(o=>o.spot);
  renderStrategyTable(base.out,p,base.elec);
  const fmtPay = x => x ? fmtDate(x) : `ani do ${longY}`;
  const p10 = proj(p, base.r, 10);
  const V = {
    btc10y: btc(p10.btc), btc6to10: btc(p10.btc-base.btc), el6to10: usd(p10.el-base.el),
    dcaCash: usd(comparison.at(-1).cash), sell5yHw: usd(base.end.sell-p.hw), roiHw: pct(Economics.roi(base.end.hodl-p.hw,p.hw)),
    today: fmtDate(TODAY), price: usd(p.price), hw: usd(p.hw), fee: pct(p.fee), up: pct(p.up), hg: pct(p.q.mode === 'catch' ? gEff(netF(p, base.r, 1826)) : p.g),
    revDay: usd(revDay,2), elecDay: usd(elecDay,2), netDay: usd(netDay,2), revMonth: usd(revDay*M), elecMonth: usd(elecDay*M), netMonth: usd(netDay*M), netYear: usd(netDay*365),
    btcMonth: btc(btcDay*M), satsDay: sats(btcDay), btcMonth1y: btc(btcDay1y*M), hpPH: usd(L0.hv*p.price*1000,2),
    paySimple: netDay>0 ? yrs(p.hw/netDay) : 'nikdy (stroj je ve ztrátě)', roiY: pct(Economics.roi(netDay*365,p.hw)),
    netHr: `${Math.round(L0.hr).toLocaleString('cs-CZ')} EH/s`,
    hpMin: usd(Math.min(...hps),2), hpMax: usd(Math.max(...hps),2), netMin: usd(Math.min(...nets),2), netMax: usd(Math.max(...nets),2), hpChg: pct(chg[Math.floor(chg.length/2)],1),
    netUp10: usd(revDay*1.1-elecDay,2), netDn10: usd(revDay*0.9-elecDay,2), netDiff10: usd(revDay/1.1-elecDay,2),
    hrGrowth12: (L0.hr/hr12.hr-1>=0?'+':'')+pct(L0.hr/hr12.hr-1), hr12: `${Math.round(hr12.hr).toLocaleString('cs-CZ')} EH/s`, btcDrop1y: pct(1-btcDay1y/btcDay),
    bePrice: usd(bePrice), bePriceH: usd(base.out[Math.min(dH, base.out.length-1)].be), beMargin: pct(1-bePrice/p.price),
    payBull: fmtPay(sc[2].payH), payBase: fmtPay(sc[1].payH), payBear: sc[0].payH ? fmtDate(sc[0].payH) : `se nezaplatí ani do ${longY}`,
    btc5y: btc(base.btc), btcPreH: btc(base.btcPreH), cost5y: usd(p.hw+base.el), costPerBtc: usd((p.hw+base.el)/base.btc), lump5y: btc(lump),
    btc12: btc(sum(hist,'btc')), net12: usd(sum(hist,'net')), btc6: btc(sum(h6,'btc')), net6: usd(sum(h6,'net')),
    scName: SCN[si][0].toLowerCase(), monthVal5y: usd(btcDay*M*base.end.pr), stack5y: usd(base.end.stack), hodl5y: usd(base.end.hodl), hodl5yHw: usd(base.end.hodl-p.hw), el5y: usd(base.el),
    price5y: usd(base.end.pr), life0: usd(sc[0].btc*sc[0].end.pr), life1: usd(sc[1].btc*sc[1].end.pr), life2: usd(sc[2].btc*sc[2].end.pr),
    dca5y: btc(dcaAcc), valMine: usd(base.btc*base.end.pr), valLump: usd(lump*base.end.pr), valDca: usd(comparison.at(-1).dcaValue),
    bearLoss: sc[0].firstLoss ? fmtDate(sc[0].firstLoss) : '–', bearEnd: usd(sc[0].end.hodl), bearStack: usd(sc[0].end.stack), bearInv: usd(sc[0].end.invested),
  };
  document.querySelectorAll('[data-k]').forEach(e => { const v = V[e.dataset.k]; e.textContent = v===undefined ? '?' : v; });
  $('kpis').innerHTML = [
    ['Čistě za měsíc', usd(netDay*M), `výnos ${usd(revDay*M)} − elektřina ${usd(elecDay*M)}`, netDay],
    ['BTC za měsíc', btc(btcDay*M), `${sats(btcDay)} denně`],
    ['Bod zvratu, cena BTC', usd(bePrice), `při dnešní síti; ${beSeries(base.out, o => usd(o.be), dH)} (${p.q.mode === 'catch' ? `síť dohání tržby, v průměru ${sgnPct(gEff(netF(p, base.r, 1826)))} ročně` : `síť ${sgnPct(p.g)} ročně`})`, p.price-bePrice],
  ].map(([l,v,s,sg]) => `<div class="kpi"><div class="l">${l}</div><div class="v ${sg===undefined?'':(sg>=0?'pos':'neg')}">${v}</div><div class="s">${s}</div></div>`).join('');

  $('tPay').innerHTML = `<thead><tr><th>Cena BTC</th><th>Cena za 5 let</th><th>Zaplacení, prodej</th><th>Zaplacení, držení</th><th>Stack − zaplaceno (vč. stroje)</th><th>ROI všech vkladů za 5 let</th><th>První den ve ztrátě</th></tr></thead><tbody>`+
    sc.map(x=>`<tr><td><span class="sw" style="background:var(${x.col})"></span>${x.name}</td><td>${usd(x.end.pr)}</td><td>${fmtPay(x.payS)}</td><td>${fmtPay(x.payH)}</td><td>${usd(x.end.hodl-p.hw)}</td><td class="${x.end.hodl>=p.hw?'pos':'neg'}">${pct(Economics.roi(x.end.hodl-p.hw,p.hw+x.el))}</td><td>${x.firstLoss?fmtDate(x.firstLoss):'–'}</td></tr>`).join('')+'</tbody>';

  // monthly history table
  const byM = {}; hist.forEach(x => { const k = x.d.slice(0,7); (byM[k] ||= {k, n:0, btc:0, rev:0, el:0, e:0}); const o=byM[k]; o.n++; o.btc+=x.btc; o.rev+=x.rev; o.el+=x.el; o.e=Math.max(o.e,x.e); });
  const MN = ['leden','únor','březen','duben','květen','červen','červenec','srpen','září','říjen','listopad','prosinec'];
  $('tHist').innerHTML = `<thead><tr><th>Měsíc</th><th>Dní</th><th>Vytěženo</th><th>Výnos</th><th>Elektřina</th><th>Čistě</th></tr></thead><tbody>`+
    Object.values(byM).map(o=>`<tr><td>${MN[+o.k.slice(5)-1]} ${o.k.slice(0,4)}</td><td>${o.n}</td><td>${btc(o.btc)}</td><td>${usd(o.rev)}</td><td>${usd(o.el)}</td><td class="${o.rev>=o.el?'pos':'neg'}">${usd(o.rev-o.el)}</td></tr>`).join('')+'</tbody>';

  const L = hist.map(x=>x.d);
  charts.push(new Chart($('cHist'), {type:'line', plugins:[zones,crosshair], options:opts(v=>'$'+v, v=>usd(v,2)), data:{labels:L, datasets:[
    line('Výnos', hist.map(x=>x.rev), css('--s1')), line('Elektřina', hist.map(x=>x.el), css('--s2')), line('Čistě', hist.map(x=>x.net), css('--s3'))]}}));

  // net per day vs BTC price, today and after halving
  const xs = []; for (let v=20000; v<=300000; v+=5000) xs.push(v);
  const o2 = opts(v=>usd(v), v=>usd(v,2));
  o2.scales.x = {type:'linear', min:20000, max:300000, grid:{display:false}, border:{color:css('--line')}, ticks:{color:css('--fg2'), callback:v=>'$'+kfmt(v), maxTicksLimit:8, font:{family:'IBM Plex Mono',size:11}}};
  o2.plugins.tooltip.callbacks.title = it => `Cena BTC ${usd(it[0].parsed.x)}`;
  charts.push(new Chart($('cPrice'), {type:'line', plugins:[crosshair], options:o2, data:{datasets:[
    line('Dnes', xs.map(v=>({x:v, y:btcDay*v-elecDay})), css('--s1')),
    line('Po halvingu', xs.map(v=>({x:v, y:btcDayH*v-elecDay})), css('--s2')),
    ref('Nula', xs.map(v=>({x:v, y:0})))]}}));


  // year-by-year bridge for the chosen scenario
  const yrRows = []; for (let y=1; y<=5; y++){ const s0 = y===1?null:base.out[365*(y-1)-1], e = base.out[Math.min(base.out.length-1, 365*y-1)];
    const btcY = e.btc-(s0?s0.btc:0), elY = e.el-(s0?s0.el:0), sellY = e.sell-(s0?s0.sell:0);
    yrRows.push(`<tr><td>${y}. rok <span class="s">do ${fmtDate(e.d)}</span></td><td>${btc(btcY)}</td><td>${btc(e.btc)}</td><td>${usd(e.pr)}</td><td>${usd(e.stack)}</td><td>${usd(elY)}</td><td>${usd(p.hw+e.el)}</td><td class="${e.stack>=p.hw+e.el?'pos':'neg'}">${usd(e.stack-p.hw-e.el)}</td><td class="${sellY>=0?'pos':'neg'}">${usd(sellY)}</td></tr>`); }
  $('tYears').innerHTML = `<thead><tr><th>Rok</th><th>Vytěženo v roce</th><th>Stack celkem</th><th>Cena BTC</th><th>Hodnota stacku</th><th>Elektřina v roce</th><th>Zaplaceno celkem (stroj + elektřina)</th><th>Hodnota stacku − zaplaceno</th><th>Pro srovnání: čistě v roce při prodeji</th></tr></thead><tbody>${yrRows.join('')}</tbody>`;
  // ---- projection charts (machine bought today, chosen scenario) ----
  const LS2 = base.out.map(x=>x.d), yb = v=>v.toLocaleString('cs-CZ',{maximumFractionDigits:3});
  const mon = {}; base.out.forEach(o => { const k = o.d.slice(0,7)+'-01'; (mon[k] ||= {k, btc:0, rev:0, el:0}); mon[k].btc += o.m; mon[k].rev += o.m*o.pr; mon[k].el += o.elecDay; mon[k].n = (mon[k].n||0)+1; });
  Object.values(mon).forEach(o => { const f = 30.44/o.n; o.btc*=f; o.rev*=f; o.el*=f; });   // normalise to an average-length month
  const monthlyX = o => { o.scales.x.ticks.callback = function(v){ const s=this.getLabelForValue(v); return s.slice(5,7)==='01' ? s.slice(0,4) : s.slice(5,7)==='07' ? 'čvc' : null; }; return o; };
  const MO = Object.values(mon).slice(1, -1);   // full months only
  charts.push(new Chart($('cMonth'), {type:'line', plugins:[zones,crosshair], options:monthlyX(opts(v=>usd(v), v=>usd(v))), data:{labels:MO.map(o=>o.k), datasets:[
    line('Výnos', MO.map(o=>o.rev), css('--s1')), line('Elektřina', MO.map(o=>o.el), css('--s2')), line('Čistě', MO.map(o=>o.rev-o.el), css('--s3'))]}}));
  const oB = monthlyX(opts(yb, v=>btc(v)));
  charts.push(new Chart($('cBtcM'), {type:'line', plugins:[zones,crosshair], options:oB, data:{labels:MO.map(o=>o.k), datasets:[
    line('BTC za měsíc', MO.map(o=>o.btc), css('--s1'), {fill:'origin', backgroundColor:css('--s1')+'22'})]}}));
  charts.push(new Chart($('cHodl'), {type:'line', plugins:[zones,crosshair], options:opts(yUsd, v=>usd(v)), data:{labels:LS2, datasets:[
    line('Hodnota vytěžených BTC', base.out.map(o=>o.stack), css('--s1')), line('Tržby z průběžného prodeje', base.out.map(o=>o.rev), css('--s4'), {borderDash:[6,4], borderWidth:1.5}),
    ref('Vloženo celkem (stroj + energie)', base.out.map(o=>o.invested))]}}));
  charts.push(new Chart($('cRoi'), {type:'line', plugins:[zones,crosshair], options:opts(v=>v+' %', v=>Math.round(v)+' %'), data:{labels:LS2, datasets:
    sc.map(x => line(x.name, x.out.map(o=>(Economics.roi(o.hodl-p.hw,p.hw+o.el)??0)*100), css(x.col))).concat([ref('Nula', LS2.map(()=>0))])}}));
  const gs = [[0,'--s3'],[.2,'--s1'],[.35,'--s4'],[.5,'--s2']];
  charts.push(new Chart($('cHr'), {type:'line', plugins:[zones,crosshair], options:opts(yb, v=>btc(v)), data:{labels:LS2, datasets:
    gs.map(([g,c]) => line(`Síť +${g*100} % ročně`, proj({...p, gFixed:true}, 0, 5, g).out.map(o=>o.btc), css(c)))}}));
  const HL = ALL.filter(r => r.d > from12);
  charts.push(new Chart($('cVar'), {type:'line', plugins:[zones,crosshair], options:opts(v=>'$'+v, v=>usd(v,2)+' /PH/den'), data:{labels:HL.map(r=>r.d), datasets:[
    line('Hashprice', HL.map(r=>r.hv*r.p*1000), css('--s1')), ref('Bod zvratu', HL.map(()=>elecDay/eff*1000))]}}));
  const xe = []; for (let v=20000; v<=500000; v+=10000) xe.push(v);
  const oE = opts(v=>yUsd(v), v=>usd(v));
  oE.scales.x = {type:'linear', min:20000, max:500000, grid:{display:false}, border:{color:css('--line')}, ticks:{color:css('--fg2'), callback:v=>'$'+kfmt(v), maxTicksLimit:8, font:{family:'IBM Plex Mono',size:11}}};
  oE.plugins.tooltip.callbacks.title = it => `BTC za 5 let ${usd(it[0].parsed.x)}`;
  charts.push(new Chart($('cEnd'), {type:'line', plugins:[crosshair], options:oE, data:{datasets:[
    line('Výsledek po 5 letech', xe.map(v=>({x:v, y:base.btc*v-base.el-p.hw})), css('--s3')), ref('Nula', xe.map(v=>({x:v, y:0})))]}}));
  charts.push(new Chart($('cHalv'), {type:'line', plugins:[zones,crosshair], options:opts(v=>kfmt(v), v=>Math.round(v).toLocaleString('cs-CZ')+' sats'), data:{labels:LS2, datasets:[
    line('Sats za den', base.out.map(o=>o.m*1e8), css('--s1'))]}}));
  const oBe = opts(yUsd, v=>usd(v));
  charts.push(new Chart($('cBe'), {type:'line', plugins:[zones,crosshair], options:oBe, data:{labels:LS2, datasets:
    [line('Bod zvratu', base.out.map(o=>o.be), css('--fg'), {borderDash:[6,4], borderWidth:2})].concat(sc.map(x => line(x.name, x.out.map(o=>o.pr), css(x.col), {borderWidth:1.5})))}}));
  charts.push(new Chart($('cVs'), {type:'line', plugins:[zones,crosshair], options:opts(yb, v=>btc(v)), data:{labels:LS2, datasets:[
    line('Těžba', base.out.map(o=>o.btc), css('--s1')), line('Spot při ročních vkladech', lumpS, css('--s2')), line('Týdenní DCA', dcaS, css('--s3'))]}}));

  // scenarios, machine bought today
  const LS = base.out.map(x=>x.d);
  const o3 = opts(yUsd, v=>usd(v));
  charts.push(new Chart($('cScen'), {type:'line', plugins:[zones,crosshair], options:o3, data:{labels:LS, datasets:
    sc.map(x => line(x.name, x.out.map(o=>o.stack), css(x.col))).concat([ref('Vloženo celkem (stroj + energie)', base.out.map(o=>o.invested))])}}));
  renderEdge(p, base.r, SCN[si][0]);
}
document.querySelectorAll('#f input, #f select').forEach(i => i.addEventListener('input', render));
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
new MutationObserver(render).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
// background zones (estimated data, projection) and halving markers
const zones = {
  id:'zones', beforeDraw(c){
    const {ctx, chartArea:a, scales:{x}} = c, Ls = c.data.labels;
    const i1 = Ls.findIndex(l => l > CM_END), i2 = Ls.findIndex(l => l > TODAY);
    const px = i => i<0 ? a.right : x.getPixelForValue(i);
    ctx.save();
    if (i1>=0){ ctx.fillStyle = css('--est'); ctx.fillRect(px(i1), a.top, (i2<0?a.right:px(i2))-px(i1), a.bottom-a.top); }
    if (i2>=0){ ctx.fillStyle = css('--grid'); ctx.globalAlpha=.7; ctx.fillRect(px(i2), a.top, a.right-px(i2), a.bottom-a.top); ctx.globalAlpha=1;
      ctx.fillStyle = css('--fg2'); ctx.font='500 11px "IBM Plex Sans", sans-serif'; ctx.fillText('projekce →', px(i2)+5, a.top+12); }
    ctx.restore();
  },
  afterDraw(c){
    const {ctx, chartArea:a, scales:{x}} = c, Ls = c.data.labels;
    ctx.save(); ctx.strokeStyle=css('--muted'); ctx.fillStyle=css('--fg2'); ctx.setLineDash([4,4]); ctx.font='500 11px "IBM Plex Sans", sans-serif';
    HALVINGS.forEach(h => { const i = Ls.indexOf(h); if (i<0) return; const px = x.getPixelForValue(i);
      ctx.beginPath(); ctx.moveTo(px,a.top); ctx.lineTo(px,a.bottom); ctx.stroke(); ctx.fillText('halving', px+5, a.top+26); });
    ctx.restore();
  }};
const crosshair = {
  id:'cross', afterDatasetsDraw(c){
    const t = c.tooltip; if (!t || !t.getActiveElements().length) return;
    const x = t.getActiveElements()[0].element.x, a = c.chartArea, ctx = c.ctx;
    ctx.save(); ctx.strokeStyle = css('--muted'); ctx.lineWidth = 1; ctx.setLineDash([3,3]);
    ctx.beginPath(); ctx.moveTo(x,a.top); ctx.lineTo(x,a.bottom); ctx.stroke(); ctx.restore();
  }};

function line(label, data, color, extra={}){
  return Object.assign({label, data, borderColor:color, backgroundColor:color, borderWidth:2, pointRadius:0, pointHoverRadius:4,
    pointHoverBorderColor:css('--panel'), pointHoverBorderWidth:2, tension:0}, extra);
}
function ref(label, data){ return line(label, data, css('--ref'), {borderWidth:1.5, borderDash:[5,4], pointHoverRadius:0}); }

function opts(yfmt, tipfmt){
  const fg2 = css('--fg2'), grid = css('--grid');
  return {
    responsive:true, maintainAspectRatio:false, animation:false,
    interaction:{mode:'index', intersect:false},
    plugins:{legend:{display:false},
      tooltip:{backgroundColor:css('--panel'), titleColor:css('--fg'), bodyColor:css('--fg2'), borderColor:css('--line'), borderWidth:1,
        padding:10, boxPadding:4, usePointStyle:true, titleFont:{family:'IBM Plex Mono',weight:'500'}, bodyFont:{family:'IBM Plex Mono'},
        callbacks:{title:it=>fmtDate(it[0].label) + (it[0].label>TODAY?'  (projekce)':it[0].label>CM_END?'  (odhad)':''), label:it=>` ${it.dataset.label}: ${tipfmt(it.parsed.y)}`}}},
    scales:{
      x:{grid:{display:false}, border:{color:css('--line')}, ticks:{color:fg2, autoSkip:false, maxRotation:0, font:{family:'IBM Plex Sans',size:11},
        callback(v){ const s=this.getLabelForValue(v); if(!s.endsWith('-01')) return null; const m=+s.slice(5,7);
          const n=this.chart.data.labels.length, wpx=this.chart.width; const per=n/Math.max(1,(wpx/48)); if (per>150 && m!==1) return null; const step = per>60?6:per>30?3:per>15?2:1;
          if ((m-1)%step) return null; return m===1 ? s.slice(0,4) : MONTHS[m-1]; }}},
      y:{grid:{color:grid}, border:{display:false}, ticks:{color:fg2, font:{family:'IBM Plex Mono',size:11}, callback:yfmt, maxTicksLimit:7}}
    }};
}
const kfmt = v => (Math.abs(v)>=1000 ? (v/1000).toLocaleString('cs-CZ',{maximumFractionDigits:1})+'k' : v.toFixed(0)).replace(/^-/,'−') ;
const yUsd = v => (v<0?'−':'')+'$'+kfmt(Math.abs(v));

// Touch: a tooltip stays after a tap. Tap the chart again, or anywhere outside a chart, to hide it.
function hideTip(c){ if (!c.tooltip || !c.tooltip.getActiveElements().length) return;
  c.tooltip.setActiveElements([], {x:0, y:0}); c.setActiveElements([]); c.update('none'); }
let tapState = null;
document.addEventListener('pointerdown', e => {
  const c = e.target.tagName === 'CANVAS' ? Chart.getChart(e.target) : null;
  charts.forEach(o => { if (o !== c) hideTip(o); });
  tapState = c ? {c, x:e.clientX, y:e.clientY, shown: c.tooltip && c.tooltip.getActiveElements().length > 0} : null;
}, true);
document.addEventListener('pointerup', e => {
  const t = tapState; tapState = null;
  if (!t || !t.shown || Math.hypot(e.clientX-t.x, e.clientY-t.y) > 10) return;   // a drag keeps scrubbing
  setTimeout(() => hideTip(t.c), 0);
}, true);

render();
