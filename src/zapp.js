const ALL = DATA.rows, CM_END = DATA.cmEnd;
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const usd = (v, d=0) => (v<0?'−':'') + '$' + Math.abs(v).toLocaleString('cs-CZ',{maximumFractionDigits:d,minimumFractionDigits:d});
const btc = v => v.toLocaleString('cs-CZ',{minimumFractionDigits:4,maximumFractionDigits:4}) + ' BTC';
const fmtDate = s => { const [y,m,d]=s.split('-'); return `${+d}. ${+m}. ${y}`; };
const MONTHS=['led','úno','bře','dub','kvě','čvn','čvc','srp','zář','říj','lis','pro'];
let charts = [];



const TODAY = ALL[ALL.length-1].d;
const HALVINGS = ['2028-11-20', '2032-11-20', '2036-11-20', '2040-11-20', '2044-11-20'];
const NEXT_HALVING = HALVINGS.find(d=>d>TODAY);          // Zcash, every 1 680 000 blocks of 75 s
const subsidy = d => 1.5625/Math.pow(2, HALVINGS.filter(h => d >= h).length);
const SC = {bear:['Pesimistický','--s2','bB','zB1','zB2'], base:['Základní','--s1','bM','zM1','zM2'], bull:['Optimistický','--s3','bU','zU1','zU2']};
function addDays(s,n){ const d=new Date(s+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
const daysBetween = (a,b) => Math.round((Date.parse(b)-Date.parse(a))/864e5);
const pctv = (id, lo=-95, hi=500) => Math.min(hi, Math.max(lo, parseFloat($(id).value) || 0));

function params(){
  const n = id => Math.max(0, parseFloat($(id).value) || 0), raw = id => parseFloat($(id).value) || 0;
  let end = $('end').value || '2030-12-31'; if (end <= TODAY) end = addDays(TODAY, 30);
  return {start:$('start').value||'2023-06-15', end, kwh:n('kwh'), fee:n('poolFee')/100, up:Math.min(1,n('uptime')/100), hw:n('hwz'),
          th:n('th')||840, w:n('w')||2780, sc:$('sc').value, g:raw('zhg')/100, k:raw('zk')};
}

// Projection: BTC price at a constant yearly rate; ZEC price with its own first-year move and a later yearly rate;
// Zcash hashrate = baseline growth x (ZEC price ratio)^k; halving halves the subsidy (fees on Zcash are negligible).
function future(p, scKey){
  const L = ALL[ALL.length-1], [, , bId, z1Id, z2Id] = SC[scKey];
  const rb = pctv(bId,-90)/100, z1 = pctv(z1Id)/100, z2 = pctv(z2Id,-90)/100, N = daysBetween(L.d, p.end), out = [];
  for (let t=1; t<=N; t++){
    const d = addDays(L.d, t), pb = L.p*Math.pow(1+rb, t/365);
    const z = L.z*Math.pow(1+z1, Math.min(t,365)/365)*Math.pow(1+z2, Math.max(0,t-365)/365);
    const hr = L.hr*Math.pow(1+p.g, t/365)*Math.pow(z/L.z, p.k);
    const mz = (L.mz-(L.fees||0))*subsidy(d)/subsidy(L.d)+(L.fees||0);
    out.push({d, p:pb, z, hr, mz, hv:mz/(hr*1e6)*z/pb, e:2});
  }
  return out;
}

function compute(p, scKey=p.sc){
  const rows = ALL.concat(future(p, scKey)).filter(r => r.d >= p.start && r.d <= p.end);
  const elecDay = p.w/1000*24*p.kwh*p.up, eff = p.th*p.up*(1-p.fee);
  let b=0, rev=0, el=0;
  const calculated = rows.map(r => {
    const mined = r.hv*eff;
    const operatingElec = Economics.daily(elecDay,energyGrowth(),rows[0].d,r.d);
    b += mined; rev += mined*r.p; el += elecDay;
    return {d:r.d, e:r.e, price:r.p, z:r.z, btc:b, rev, el, net:rev-el, stack:b*r.p, hodl:b*r.p-el, mined, loss: mined*r.p < operatingElec,
            sats:mined*1e8, hp:r.hv*r.p*1000, hv:r.hv, hr:r.hr, be: p.th>0 ? operatingElec/eff*1000 : 0,
            bez: mined > 0 ? operatingElec*r.z/(mined*r.p) : null};   // ZEC price that just pays the electricity with that day's network
  });
  return Economics.account(calculated,{hw:p.hw,elecDay,energyGrowth:energyGrowth()});
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
      ctx.beginPath(); ctx.moveTo(px,a.top); ctx.lineTo(px,a.bottom); ctx.stroke(); ctx.fillText('halving ZEC', px+5, a.top+26); });
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


function render(){
  const p = params(), s = compute(p);
  charts.forEach(c => c.destroy()); charts = [];
  if (!s.length) return;
  const L = s.map(r => r.d), iT = Math.max(0, L.indexOf(TODAY)), now = s[iT], end = s[s.length-1];
  const hw = s.map(()=>p.hw), tip = v => usd(v), pl = [zones, crosshair];
  charts.push(new Chart($('c1'), {type:'line', plugins:pl, options:opts(yUsd,tip), data:{labels:L, datasets:[
    line('Tržba celkem', s.map(r=>r.rev), css('--s1')),
    line('Energie zaplacená předem', s.map(r=>r.el), css('--s2')),
    line('Čistý zisk', s.map(r=>r.net), css('--s3')),
    ref('Cena stroje', hw)]}}));
  charts.push(new Chart($('c2'), {type:'line', plugins:pl, options:opts(yUsd,tip), data:{labels:L, datasets:[
    line('Hodnota stacku', s.map(r=>r.stack), css('--s1')),
    line('Energie zaplacená předem', s.map(r=>r.el), css('--s2')),
    line('Čistá hodnota', s.map(r=>r.hodl), css('--s3')),
    line('Průběžný prodej', s.map(r=>r.net), css('--s4'), {borderDash:[6,4], borderWidth:1.5}),
    ref('Cena stroje', hw)]}}));
  const o3 = opts(v=>v.toLocaleString('cs-CZ',{maximumFractionDigits:2}), v=>btc(v));
  o3.plugins.tooltip.callbacks.afterBody = it => { const r=s[it[0].dataIndex]; return [` Cena BTC: ${usd(r.price)}`, ` Cena ZEC: ${usd(r.z)}`]; };
  charts.push(new Chart($('c3'), {type:'line', plugins:pl, options:o3, data:{labels:L, datasets:[
    line('Vyplaceno', s.map(r=>r.btc), css('--s1'), {fill:'origin', backgroundColor:css('--s1')+'22'})]}}));
  renderCompare(p, s, iT);
  renderProj(p, s, iT);
  charts.push(new Chart($('c4'), {type:'line', plugins:pl, options:opts(v=>'$'+v, v=>usd(v,2)+' /MSol/den'), data:{labels:L, datasets:[
    line('Výnos', s.map(r=>r.hp), css('--s1')),
    ref('Bod zvratu', s.map(r=>r.be))]}}));
  charts.push(new Chart($('c6'), {type:'line', plugins:pl, options:opts(v=>kfmt(v), v=>Math.round(v).toLocaleString('cs-CZ')+' sats'), data:{labels:L, datasets:[
    line('Denní výplata', s.map(r=>r.sats), css('--s4'))]}}));
  const o9 = opts(v=>'$'+kfmt(v), v=>usd(v)); o9.scales.y.type = 'logarithmic';
  charts.push(new Chart($('c9'), {type:'line', plugins:pl, options:o9, data:{labels:L, datasets:[
    line('Cena ZEC', s.map(r=>r.z), css('--s5')), line('Bod zvratu', s.map(r=>r.bez), css('--fg2'), {borderDash:[6,4], borderWidth:1.5})]}}));

  const be1 = s.find(r => r.net >= p.hw), be2 = s.find(r => r.hodl >= p.hw);
  const maxNet = s.reduce((m,r)=>r.net>m.net?r:m, s[0]);
  // energy is prepaid a whole contractual year ahead: the last payment also covers days after the end of the projection
  const pre = end.prepaid > 0 ? ` (z toho ${usd(end.prepaid)} předplaceno na dny po konci odhadu)` : '';
  const k = [
    ['Vyplaceno dosud', btc(now.btc), `${iT+1} dní těžby`],
    [`Celkem vloženo do ${fmtDate(end.d)}`, usd(end.invested), `stroj ${usd(p.hw)} + energie ${usd(end.el)} (${Math.floor(Economics.days(s[0].d, end.d)/365)+1} ročních plateb předem${end.prepaid > 0 ? `; ${usd(end.prepaid)} z toho připadá na dny po konci odhadu` : ""})`],
    [`Těžba + prodej: tržby do ${fmtDate(end.d)}`, usd(end.rev), `${SC[p.sc][0].toLowerCase()} scénář; po odečtení energie ${usd(end.el)}${pre} zbývá ${usd(end.net)}, `+(end.net-p.hw>=0?'po odečtení stroje ':'na cenu stroje chybí ')+usd(Math.abs(end.net-p.hw))+`. K ${fmtDate(now.d)}: tržby ${usd(now.rev)}`, end.rev-end.invested],
    [`Těžba + držení: hodnota BTC k ${fmtDate(end.d)}`, usd(end.stack), `${btc(end.btc)} × ${usd(end.price)}/BTC (${SC[p.sc][0].toLowerCase()} scénář); po odečtení energie ${usd(end.el)}${pre} zbývá ${usd(end.hodl)}, `+(end.hodl-p.hw>=0?'po odečtení stroje ':'na cenu stroje chybí ')+usd(Math.abs(end.hodl-p.hw))+`. K ${fmtDate(now.d)}: ${usd(now.stack)}`, end.stack-end.invested],
    [`Natěženo do ${fmtDate(end.d)}`, btc(end.btc), `${SC[p.sc][0].toLowerCase()} scénář; z toho ${btc(Math.max(0,end.btc-now.btc))} v projekci, cena BTC na konci ${usd(end.price)}`],
    [`Návratnost, stroj koupený ${fmtDate(p.start)}`, be2?fmtDate(be2.d):`do ${fmtDate(end.d)} ne`,
      'při držení BTC; průběžný prodej: '+(be1?fmtDate(be1.d):`do ${fmtDate(end.d)} ne (čistý zisk max. ${usd(maxNet.net)}, ${fmtDate(maxNet.d)})`), be2?1:-1],
    ['Aktuální denní zisk', usd((now.hp-now.be)*p.th*p.up*(1-p.fee)/1000,2), `${Math.round(now.sats).toLocaleString('cs-CZ')} sats/den, ZEC ${usd(now.z)}`, now.hp-now.be],
  ];
  // HODL: the same deposits on the same days bought as BTC at once and held (spot buys from the strategy table)
  const cE = Economics.compare(s, {hw:p.hw, elecDay:p.w/1000*24*p.kwh*p.up, energyGrowth:energyGrowth()}).at(-1);
  const hodlTile = [`HODL: spot nákupy k ${fmtDate(end.d)}`, usd(cE.spotValue), `${btc(cE.spot)} koupeno za stejné vklady ve stejné dny (stroj + rok energie při startu, pak energie každých 365 dní) a drženo do konce; `+(cE.spotValue>=end.stack?'o ':'')+`${usd(Math.abs(cE.spotValue-end.stack))} ${cE.spotValue>=end.stack?'víc':'méně'} než těžba + držení`, cE.spotValue-end.invested];
  // side by side: what went in, mining + holding, HODL; then BTC count, selling, payback; then today
  const K = [k[1], k[3], hodlTile, k[4], k[2], k[5], k[0], k[6]];
  $('kpis').innerHTML = K.map(([l,v,sub,sg]) => `<div class="kpi"><div class="l">${l}</div><div class="v ${sg===undefined?'':(sg>=0?'pos':'neg')}">${v}</div><div class="s">${sub}</div></div>`).join('');
  document.querySelectorAll('.endLabel').forEach(e => e.textContent = fmtDate(p.end));
}

function renderCompare(p,s,iT){
  const elecDay=p.w/1000*24*p.kwh*p.up;
  const comparison=Economics.compare(s,{hw:p.hw,elecDay,energyGrowth:energyGrowth()});
  const L=s.map(r=>r.d), yb=v=>v.toLocaleString('cs-CZ',{maximumFractionDigits:3});
  const ds=[line('Těžba + držení',s.map(r=>r.btc),css('--s1'))];
  charts.push(new Chart($('c7'),{type:'line',plugins:[zones,crosshair],options:opts(yb,v=>btc(v)),data:{labels:L,datasets:ds.concat([line('Spot při ročních vkladech',comparison.map(r=>r.spot),css('--s2'))])}}));
  charts.push(new Chart($('c8'),{type:'line',plugins:[zones,crosshair],options:opts(yb,v=>btc(v)),data:{labels:L,datasets:ds.concat([line('Týdenní DCA',comparison.map(r=>r.dca),css('--s3'))])}}));
  const marks=[['K datu dat',iT],['Konec období',s.length-1]];
  $('ctab').innerHTML='<thead><tr><th>Datum</th><th>Těžba BTC</th><th>Spot BTC</th><th>DCA BTC</th><th>DCA hotovost</th><th>Vloženo</th></tr></thead><tbody>'+marks.map(([label,i])=>`<tr><td>${label}: ${fmtDate(L[i])}</td><td>${btc(s[i].btc)}</td><td>${btc(comparison[i].spot)}</td><td>${btc(comparison[i].dca)}</td><td>${usd(comparison[i].cash)}</td><td>${usd(comparison[i].invested)}</td></tr>`).join('')+'</tbody>';
  $('budget').textContent=`První vklad ${usd(p.hw+365*elecDay)} (stroj ${usd(p.hw)} + rok energie ${usd(365*elecDay)}); potom každých 365 dní ${usd(365*elecDay)}.`;
  $('dcaInfo').textContent='Každý roční vklad se rozdělí do 53 nákupů: den 0, 7, …, 364 daného smluvního roku. Zbytek zůstává v hotovosti.';
  renderStrategyTable(s,p,elecDay);
}

function renderProj(p, s, iT){
  const res = Object.keys(SC).map(k => { const r = compute(p, k), e = r[r.length-1];
    return {k, name:SC[k][0], col:SC[k][1], r, e, off:r.slice(iT+1).filter(x=>x.loss).length,
            pay:r.find(x=>x.d>TODAY && x.hodl>=p.hw), held:r.slice(iT).every(x=>x.hodl>=p.hw)}; });
  const sgp = v => `${v<0?'−':'+'}${Math.abs(v)} %`;
  res.forEach(x => { const [n,,b,z1,z2] = SC[x.k], t = `${n} (ZEC ${sgp(pctv(z1))}, pak ${sgp(pctv(z2,-90))} / rok; BTC ${sgp(pctv(b,-90))})`;
    x.label = t; const el = $('lg_'+x.k); if (el) el.textContent = t; });
  const from = Math.max(0, iT-365), L = s.slice(from).map(r=>r.d), now = s[iT];
  const ds = [line('Dosud', s.slice(from).map((r,i)=> from+i<=iT ? r.hodl : null), css('--fg2'))]
    .concat(res.map(x => line(x.label||x.name, x.r.slice(from).map((r,i)=> from+i>=iT ? r.hodl : null), css(x.col))))
    .concat([ref('Cena stroje', L.map(()=>p.hw))]);
  const o = opts(yUsd, v=>usd(v)); o.plugins.tooltip.filter = it => it.parsed.y!==null;
  charts.push(new Chart($('c5'), {type:'line', plugins:[zones,crosshair], options:o, data:{labels:L, datasets:ds}}));
  const sg = v => v.toLocaleString('cs-CZ',{signDisplay:'always'})+' %';
  const endD = fmtDate(res[0].e.d);
  $('ptab').innerHTML = `<thead><tr><th>Scénář</th><th>BTC ročně</th><th>ZEC 1. rok / dál</th><th>Čistá hodnota ${endD}</th><th>Návratnost stroje</th><th>Stack celkem</th><th>Vyplaceno v projekci</th><th>Cena BTC ${endD}</th><th>Cena ZEC ${endD}</th><th>Elektřina celkem</th><th>Dnů ve ztrátě</th></tr></thead><tbody>`+
    `<tr><td><span class="sw" style="background:var(--fg2)"></span>Dnes, ${fmtDate(now.d)}</td><td>–</td><td>–</td><td>${usd(now.hodl)}</td><td>${now.hodl>=p.hw?'splaceno':'–'}</td><td>${btc(now.btc)}</td><td>–</td><td>${usd(now.price)}</td><td>${usd(now.z)}</td><td>${usd(now.el)}</td><td>–</td></tr>`+
    res.map(x=>`<tr><td><span class="sw" style="background:var(${x.col})"></span>${x.name}</td><td>${sg(pctv(SC[x.k][2],-90))}</td><td>${sg(pctv(SC[x.k][3]))} / ${sg(pctv(SC[x.k][4],-90))}</td><td class="${x.e.hodl>=p.hw?'pos':'neg'}">${usd(x.e.hodl)}</td><td>${x.held?'splaceno, trvale':x.pay?(now.hodl>=p.hw?'znovu ':'')+fmtDate(x.pay.d):'do konce ne'}</td><td>${btc(x.e.btc)}</td><td>${(x.e.btc-now.btc).toFixed(4).replace('.',',')} BTC</td><td>${usd(x.e.price)}</td><td>${usd(x.e.z)}</td><td>${usd(x.e.el)}</td><td>${x.off}</td></tr>`).join('')+'</tbody>';
}
document.querySelectorAll('#f input, #f select, #fx input, #fx select').forEach(i => i.addEventListener('input', render));
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
