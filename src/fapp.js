const ALL = DATA.rows, CM_END = DATA.cmEnd;
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const usd = (v, d=0) => (v<0?'−':'') + '$' + Math.abs(v).toLocaleString('cs-CZ',{maximumFractionDigits:d,minimumFractionDigits:d});
const btc = v => v.toLocaleString('cs-CZ',{minimumFractionDigits:4,maximumFractionDigits:4}) + ' BTC';
const fmtDate = s => { const [y,m,d]=s.split('-'); return `${+d}. ${+m}. ${y}`; };
const MONTHS=['led','úno','bře','dub','kvě','čvn','čvc','srp','zář','říj','lis','pro'];
let charts = [];



const L0 = ALL[ALL.length-1], TODAY = L0.d;
const HALVINGS = ['2028-04-10','2032-04-10'];
const subsidy = d => 3.125/Math.pow(2, HALVINGS.filter(h => d >= h).length);
function addDays(s,n){ const d=new Date(s+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
const daysBetween = (a,b) => Math.round((Date.parse(b)-Date.parse(a))/864e5);
const pct = (v, d=0) => (v*100).toLocaleString('cs-CZ',{maximumFractionDigits:d}) + ' %';
const sats = v => Math.round(v*1e8).toLocaleString('cs-CZ') + ' sats';
const yrs = d => { const y = d/365; return y < 1 ? `${Math.round(d/30.4)} měsíců` : `${y.toLocaleString('cs-CZ',{minimumFractionDigits:1,maximumFractionDigits:1})} roku`; };
const TH = 270, W = 3645, FEE0 = Math.max(0, L0.hv*L0.hr*1e6/144 - 3.125);   // BTC fees per block today

function P(){
  const n = id => Math.max(0, parseFloat($(id).value) || 0);
  return {price:n('fPrice')||L0.p, kwh:n('fKwh'), fee:Math.min(.9,n('fFee')/100), up:Math.min(1,n('fUp')/100), hw:n('fHwS'), g:(parseFloat($('fHg').value)||0)/100};
}
// daily BTC per TH for the network state t days from today
const hvAt = (p, t, d, g=p.g) => 144*(subsidy(d)+FEE0)/(L0.hr*1e6*Math.pow(1+g, t/365));

// machine bought today, run 5 years; price changes r per year
function proj(p, r, years=5, g=p.g){
  const N = Math.round(365*years), eff = TH*p.up*(1-p.fee), elec = W/1000*24*p.kwh*p.up, out = [];
  let b=0, el=0, rev=0, firstLoss=null, payS=null, payH=null, btcPreH=0;
  for (let t=1; t<=N; t++){
    const d = addDays(TODAY, t), pr = p.price*Math.pow(1+r, t/365), m = hvAt(p,t,d,g)*eff;
    b += m; el += elec; rev += m*pr; if (d < HALVINGS[0]) btcPreH = b;
    if (firstLoss===null && m*pr < elec) firstLoss = d;
    if (payS===null && rev-el >= p.hw) payS = d;
    if (payH===null && b*pr-el >= p.hw) payH = d;
    out.push({d, pr, m, btc:b, el, stack:b*pr, hodl:b*pr-el, sell:rev-el, be:elec/m});
  }
  return {out, btc:b, el, elec, end:out[N-1], firstLoss, payS, payH, btcPreH};
}
const SCN = [['Pesimistický +10 % ročně',.10,'--s2'],['Základní +20 % ročně',.20,'--s1'],['Optimistický +40 % ročně',.40,'--s3']];

function render(){
  const p = P(); charts.forEach(c=>c.destroy()); charts = [];
  const eff = TH*p.up*(1-p.fee), btcDay = L0.hv*eff, revDay = btcDay*p.price, elecDay = W/1000*24*p.kwh*p.up, netDay = revDay-elecDay;
  const M = 30.44, bePrice = elecDay/btcDay;
  const dH = daysBetween(TODAY, HALVINGS[0]), btcDayH = hvAt(p, dH, HALVINGS[0])*eff, bePriceH = elecDay/btcDayH;
  const btcDay1y = hvAt(p, 365, addDays(TODAY,365))*eff;
  // last 12 months history with current parameters
  const from12 = addDays(TODAY,-365), from6 = addDays(TODAY,-182);
  const H = ALL.filter(r => r.d > from12);
  const hist = H.map(r => { const m = r.hv*eff; return {d:r.d, e:r.e, rev:m*r.p, el:elecDay, net:m*r.p-elecDay, btc:m, hp:r.hv*r.p*1000}; });
  const sum = (a,k) => a.reduce((s,x)=>s+x[k],0);
  const h6 = hist.filter(x=>x.d>from6);
  const hps = hist.map(x=>x.hp), chg = hist.slice(1).map((x,i)=>Math.abs(x.hp/hist[i].hp-1)).sort((a,b)=>a-b);
  const nets = hist.map(x=>x.net);
  const hr12 = ALL.find(r=>r.d===from12) || ALL[0];
  const sc = SCN.map(([name,r,col]) => ({name,r,col,...proj(p,r)}));
  const si = +($('fScen3').value||1), base = sc[si];
  const lump = (p.hw + base.el)/p.price;
  const nB = Math.floor((base.out.length-1)/7)+1, perB = (p.hw+base.el)/nB; let dcaAcc = 0;
  const dcaS = base.out.map((o,i) => { if (i%7===0) dcaAcc += perB/(i===0?p.price:o.pr); return dcaAcc; });
  const fmtPay = x => x ? fmtDate(x) : 'do 5 let ne';
  const V = {
    today: fmtDate(TODAY), price: usd(p.price), hw: usd(p.hw), fee: pct(p.fee), up: pct(p.up), hg: pct(p.g),
    revDay: usd(revDay,2), elecDay: usd(elecDay,2), netDay: usd(netDay,2), revMonth: usd(revDay*M), elecMonth: usd(elecDay*M), netMonth: usd(netDay*M), netYear: usd(netDay*365),
    btcMonth: btc(btcDay*M), satsDay: sats(btcDay), btcMonth1y: btc(btcDay1y*M), hpPH: usd(L0.hv*p.price*1000,2),
    paySimple: netDay>0 ? yrs(p.hw/netDay) : 'nikdy (stroj je ve ztrátě)', roiY: netDay>0 ? pct(netDay*365/p.hw) : pct(netDay*365/p.hw),
    netHr: `${Math.round(L0.hr).toLocaleString('cs-CZ')} EH/s`,
    hpMin: usd(Math.min(...hps),2), hpMax: usd(Math.max(...hps),2), netMin: usd(Math.min(...nets),2), netMax: usd(Math.max(...nets),2), hpChg: pct(chg[Math.floor(chg.length/2)],1),
    netUp10: usd(revDay*1.1-elecDay,2), netDn10: usd(revDay*0.9-elecDay,2), netDiff10: usd(revDay/1.1-elecDay,2),
    hrGrowth12: (L0.hr/hr12.hr-1>=0?'+':'')+pct(L0.hr/hr12.hr-1), hr12: `${Math.round(hr12.hr).toLocaleString('cs-CZ')} EH/s`, btcDrop1y: pct(1-btcDay1y/btcDay),
    bePrice: usd(bePrice), bePriceH: usd(bePriceH), beMargin: pct(1-bePrice/p.price),
    payBull: fmtPay(sc[2].payH), payBase: fmtPay(sc[1].payH), payBear: sc[0].payH ? fmtDate(sc[0].payH) : 'se do 5 let nezaplatí',
    btc5y: btc(base.btc), btcPreH: btc(base.btcPreH), cost5y: usd(p.hw+base.el), costPerBtc: usd((p.hw+base.el)/base.btc), lump5y: btc(lump),
    btc12: btc(sum(hist,'btc')), net12: usd(sum(hist,'net')), btc6: btc(sum(h6,'btc')), net6: usd(sum(h6,'net')),
    scName: SCN[si][0].toLowerCase(), monthVal5y: usd(btcDay*M*base.end.pr), stack5y: usd(base.end.stack), hodl5y: usd(base.end.hodl), hodl5yHw: usd(base.end.hodl-p.hw), el5y: usd(base.el),
    price5y: usd(base.end.pr), life0: usd(sc[0].btc*sc[0].end.pr), life1: usd(sc[1].btc*sc[1].end.pr), life2: usd(sc[2].btc*sc[2].end.pr),
    dca5y: btc(dcaAcc), valMine: usd(base.btc*base.end.pr), valLump: usd(lump*base.end.pr), valDca: usd(dcaAcc*base.end.pr),
    bearLoss: sc[0].firstLoss ? fmtDate(sc[0].firstLoss) : '–', bearEnd: usd(sc[0].end.hodl),
  };
  document.querySelectorAll('[data-k]').forEach(e => { const v = V[e.dataset.k]; e.textContent = v===undefined ? '?' : v; });
  $('kpis').innerHTML = [
    ['Čistě za měsíc', usd(netDay*M), `výnos ${usd(revDay*M)} − elektřina ${usd(elecDay*M)}`, netDay],
    ['BTC za měsíc', btc(btcDay*M), `${sats(btcDay)} denně`],
    ['Bod zvratu, cena BTC', usd(bePrice), `po halvingu 2028 asi ${usd(bePriceH)}`, p.price-bePrice],
  ].map(([l,v,s,sg]) => `<div class="kpi"><div class="l">${l}</div><div class="v ${sg===undefined?'':(sg>=0?'pos':'neg')}">${v}</div><div class="s">${s}</div></div>`).join('');

  $('tPay').innerHTML = `<thead><tr><th>Cena BTC</th><th>Cena za 5 let</th><th>Zaplacení, prodej</th><th>Zaplacení, držení</th><th>Stack − zaplaceno (vč. stroje)</th><th>ROI za 5 let</th><th>První den ve ztrátě</th></tr></thead><tbody>`+
    sc.map(x=>`<tr><td><span class="sw" style="background:var(${x.col})"></span>${x.name}</td><td>${usd(x.end.pr)}</td><td>${fmtPay(x.payS)}</td><td>${fmtPay(x.payH)}</td><td>${usd(x.end.hodl-p.hw)}</td><td class="${x.end.hodl>=p.hw?'pos':'neg'}">${pct(x.end.hodl/p.hw-1)}</td><td>${x.firstLoss?fmtDate(x.firstLoss):'–'}</td></tr>`).join('')+'</tbody>';

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
  const mon = {}; base.out.forEach(o => { const k = o.d.slice(0,7)+'-01'; (mon[k] ||= {k, btc:0, rev:0, el:0}); mon[k].btc += o.m; mon[k].rev += o.m*o.pr; mon[k].el += base.elec; mon[k].n = (mon[k].n||0)+1; });
  Object.values(mon).forEach(o => { const f = 30.44/o.n; o.btc*=f; o.rev*=f; o.el*=f; });   // normalise to an average-length month
  const monthlyX = o => { o.scales.x.ticks.callback = function(v){ const s=this.getLabelForValue(v); return s.slice(5,7)==='01' ? s.slice(0,4) : s.slice(5,7)==='07' ? 'čvc' : null; }; return o; };
  const MO = Object.values(mon).slice(1, -1);   // full months only
  charts.push(new Chart($('cMonth'), {type:'line', plugins:[zones,crosshair], options:monthlyX(opts(v=>usd(v), v=>usd(v))), data:{labels:MO.map(o=>o.k), datasets:[
    line('Výnos', MO.map(o=>o.rev), css('--s1')), line('Elektřina', MO.map(o=>o.el), css('--s2')), line('Čistě', MO.map(o=>o.rev-o.el), css('--s3'))]}}));
  const oB = monthlyX(opts(yb, v=>btc(v)));
  charts.push(new Chart($('cBtcM'), {type:'line', plugins:[zones,crosshair], options:oB, data:{labels:MO.map(o=>o.k), datasets:[
    line('BTC za měsíc', MO.map(o=>o.btc), css('--s1'), {fill:'origin', backgroundColor:css('--s1')+'22'})]}}));
  charts.push(new Chart($('cHodl'), {type:'line', plugins:[zones,crosshair], options:opts(yUsd, v=>usd(v)), data:{labels:LS2, datasets:[
    line('Hodnota vytěžených BTC', base.out.map(o=>o.stack), css('--s1')), line('Elektřina celkem', base.out.map(o=>o.el), css('--s2')),
    line('Čistě při držení', base.out.map(o=>o.hodl), css('--s3')), line('Čistě při prodeji', base.out.map(o=>o.sell), css('--s4'), {borderDash:[6,4], borderWidth:1.5}),
    ref('Cena stroje', LS2.map(()=>p.hw))]}}));
  charts.push(new Chart($('cRoi'), {type:'line', plugins:[zones,crosshair], options:opts(v=>v+' %', v=>Math.round(v)+' %'), data:{labels:LS2, datasets:
    sc.map(x => line(x.name, x.out.map(o=>(o.hodl-p.hw)/p.hw*100), css(x.col))).concat([ref('Nula', LS2.map(()=>0))])}}));
  const gs = [[0,'--s3'],[.2,'--s1'],[.35,'--s4'],[.5,'--s2']];
  charts.push(new Chart($('cHr'), {type:'line', plugins:[zones,crosshair], options:opts(yb, v=>btc(v)), data:{labels:LS2, datasets:
    gs.map(([g,c]) => line(`Síť +${g*100} % ročně`, proj(p, 0, 5, g).out.map(o=>o.btc), css(c)))}}));
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
    line('Těžba', base.out.map(o=>o.btc), css('--s1')), line('Jednorázový nákup dnes', LS2.map(()=>lump), css('--s2')), line('Týdenní DCA', dcaS, css('--s3'))]}}));

  // scenarios, machine bought today
  const LS = base.out.map(x=>x.d);
  const o3 = opts(yUsd, v=>usd(v));
  charts.push(new Chart($('cScen'), {type:'line', plugins:[zones,crosshair], options:o3, data:{labels:LS, datasets:
    sc.map(x => line(x.name, x.out.map(o=>o.hodl), css(x.col))).concat([ref('Cena stroje', LS.map(()=>p.hw))])}}));
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
