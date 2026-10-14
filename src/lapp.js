const ALL = DATA.rows, CM_END = DATA.cmEnd;
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const usd = (v, d=0) => (v<0?'−':'') + '$' + Math.abs(v).toLocaleString('cs-CZ',{maximumFractionDigits:d,minimumFractionDigits:d});
const btc = v => v.toLocaleString('cs-CZ',{minimumFractionDigits:4,maximumFractionDigits:4}) + ' BTC';
const fmtDate = s => { const [y,m,d]=s.split('-'); return `${+d}. ${+m}. ${y}`; };
const MONTHS=['led','úno','bře','dub','kvě','čvn','čvc','srp','zář','říj','lis','pro'];
let charts = [];


const TODAY = ALL[ALL.length-1].d;
const HALVINGS = ['2028-04-10','2032-04-10','2036-04-10','2040-04-10'];
const subsidy = d => 3.125/Math.pow(2, HALVINGS.filter(h => d >= h).length);
const SC = {bear:['Pesimistický','--s2','yBear'], base:['Základní','--s1','yBase'], bull:['Optimistický','--s3','yBull']};
function addDays(s,n){ const d=new Date(s+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
const daysBetween = (a,b) => Math.round((Date.parse(b)-Date.parse(a))/864e5);

function params(){
  const n = id => Math.max(0, parseFloat($(id).value) || 0), raw = id => parseFloat($(id).value) || 0;
  let end = $('end').value || '2030-12-31'; if (end <= TODAY) end = addDays(TODAY, 30);
  return {start:$('start').value||'2024-06-17', end, kwh:n('kwh'), fee:n('poolFee')/100, up:Math.min(1,n('uptime')/100), hw:n('hwS'),
          th:n('th')||270, w:n('w')||3645, sc:$('sc').value, g:raw('hgr')/100, F:1+raw('feeBull')/100};
}

// Daily projection after the last known day: scenario price path, growing network hashrate,
// halving-adjusted subsidy and fees per block (flat, or rising after the halving when bullFees).
function future(p, scKey, bullFees){
  const L = ALL[ALL.length-1], r = Math.min(500, Math.max(-90, parseFloat($(SC[scKey][2]).value) || 0))/100;   // yearly price change
  const fee0 = Math.max(0, L.hv*L.hr*1e6/144 - 3.125), N = daysBetween(L.d, p.end), out = [];
  for (let t=1; t<=N; t++){
    const d = addDays(L.d, t), hr = L.hr*Math.pow(1+p.g, t/365);
    const ramp = Math.min(1, Math.max(0, daysBetween(HALVINGS[0], d)/365));
    const fee = fee0*(bullFees ? 1+(p.F-1)*ramp : 1);
    out.push({d, p:L.p*Math.pow(1+r, t/365), hr, hv:144*(subsidy(d)+fee)/(hr*1e6), e:2});
  }
  return out;
}

function compute(p, scKey=p.sc, bullFees=false){
  const rows = ALL.filter(r => r.d >= p.start).concat(future(p, scKey, bullFees));
  const elecDay = p.w/1000*24*p.kwh*p.up;
  let b=0, rev=0, el=0;
  return rows.map(r => {
    const mined = r.hv*p.th*p.up*(1-p.fee);
    b += mined; rev += mined*r.p; el += elecDay;
    return {d:r.d, e:r.e, price:r.p, btc:b, rev, el, net:rev-el, stack:b*r.p, hodl:b*r.p-el, mined, loss: mined*r.p < elecDay,
            hp:r.hv*r.p*1000, hv:r.hv, hr:r.hr, be: p.th>0 ? elecDay/(p.th*p.up*(1-p.fee))*1000 : 0};
  });
}

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


const LS = [['ls1','A','--s2'],['ls2','B','--s3'],['ls3','C','--s5'],['ls4','D','--s6'],['ls5','E','--s4']];
function render(){
  const p = params(), s = compute(p);
  charts.forEach(c => c.destroy()); charts = [];
  if (!s.length) return;
  const L = s.map(r=>r.d), n = L.length, end = s[n-1], budget = p.hw + end.el;
  const buyBtc = s.map(r => budget/r.price);
  const yb = v=>v.toLocaleString('cs-CZ',{maximumFractionDigits:3});
  // chart 1: BTC per purchase day vs mining end stack
  const ents = LS.map(([id,k,col]) => { const d = id==='ls1' ? L[0] : $(id).value; const i = L.indexOf(d); return {id,k,col,d,i}; }).filter(e => e.i>=0);
  const o1 = opts(yb, v=>btc(v));
  o1.plugins.tooltip.callbacks.afterBody = it => [` Cena BTC: ${usd(s[it[0].dataIndex].price)}`];
  const pts = L.map((_,i) => { const e = ents.find(x=>x.i===i); return e ? buyBtc[i] : null; });
  charts.push(new Chart($('l1'), {type:'line', plugins:[zones,crosshair], options:o1, data:{labels:L, datasets:[
    line('Jednorázový nákup v tento den', buyBtc, css('--s2')),
    line('Stack z těžby na konci', L.map(()=>end.btc), css('--s1'), {borderDash:[6,4], borderWidth:1.5, pointHoverRadius:0}),
    {label:'Vybrané dny', data:pts, showLine:false, pointRadius:6, pointHoverRadius:7, pointBackgroundColor:ents.length?L.map((_,i)=>{const e=ents.find(x=>x.i===i);return e?css(e.col):'transparent';}):[], pointBorderColor:css('--panel'), pointBorderWidth:2, borderColor:'transparent'}
  ]}}));
  // chart 2: stacks over time
  const ds = [line('Těžba', s.map(r=>r.btc), css('--s1'), {borderWidth:2.5})].concat(ents.map(e =>
    line(`Nákup ${e.k} (${fmtDate(e.d)})`, L.map((_,i)=> i<e.i ? 0 : buyBtc[e.i]), css(e.col), {borderWidth:1.5, stepped:true})));
  charts.push(new Chart($('l2'), {type:'line', plugins:[zones,crosshair], options:opts(yb, v=>btc(v)), data:{labels:L, datasets:ds}}));
  $('leg2').innerHTML = `<span><i style="background:var(--s1)"></i>Těžba</span>`+ents.map(e=>`<span><i style="background:var(${e.col})"></i>Nákup ${e.k}</span>`).join('');
  const pct = (a,b) => ((a/b-1)*100).toLocaleString('cs-CZ',{maximumFractionDigits:0,signDisplay:'always'})+' %';
  const iBest = buyBtc.indexOf(Math.max(...buyBtc.slice(0, L.indexOf(TODAY)+1))), iWorst = buyBtc.indexOf(Math.min(...buyBtc.slice(0, L.indexOf(TODAY)+1)));
  const rows = ents.map(e => [`<span class="sw" style="background:var(${e.col})"></span>Nákup ${e.k}`, e.i])
    .concat([['Nejlepší den dosud (nejnižší cena)', iBest], ['Nejhorší den dosud (nejvyšší cena)', iWorst]]);
  $('ltab').innerHTML = `<thead><tr><th>Nákup</th><th>Datum</th><th>Cena BTC</th><th>Koupeno</th><th>Těžba oproti nákupu</th><th>Hodnota ${fmtDate(end.d)}</th></tr></thead><tbody>`+
    `<tr><td><span class="sw" style="background:var(--s1)"></span>Těžba</td><td>${fmtDate(L[0])} – ${fmtDate(end.d)}</td><td>–</td><td>${btc(end.btc)}</td><td>–</td><td>${usd(end.btc*end.price)}</td></tr>`+
    rows.map(([t,i]) => `<tr><td>${t}</td><td>${fmtDate(L[i])}${L[i]>TODAY?' (projekce)':''}</td><td>${usd(s[i].price)}</td><td>${btc(buyBtc[i])}</td><td class="${buyBtc[i]>end.btc?'neg':'pos'}">${pct(end.btc, buyBtc[i])}</td><td>${usd(buyBtc[i]*end.price)}</td></tr>`).join('')+'</tbody>';
  $('budget').textContent = usd(budget);
  const beat = buyBtc.filter(x=>x>end.btc).length, nH = L.indexOf(TODAY)+1, beatH = buyBtc.slice(0,nH).filter(x=>x>end.btc).length;
  $('kpis').innerHTML = [
    ['Celková částka', usd(budget), `stroj ${usd(p.hw)} + elektřina ${usd(end.el)}`],
    [`Těžba do ${fmtDate(end.d)}`, btc(end.btc), `${n} dní těžby`],
    ['Dny, kdy nákup porazí těžbu', `${Math.round(beatH/nH*100)} %`, `do dneška ${beatH} z ${nH} dní; včetně projekce ${Math.round(beat/n*100)} %`],
  ].map(([l,v,sub]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${sub}</div></div>`).join('');
}
document.querySelectorAll('#f input, #f select, #fx input, #fx select, #fl input').forEach(i => i.addEventListener('input', render));
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
new MutationObserver(render).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
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
