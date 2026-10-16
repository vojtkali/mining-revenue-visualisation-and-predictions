const ALL = DATA.rows, CM_END = DATA.cmEnd;
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const usd = (v, d=0) => (v<0?'−':'') + '$' + Math.abs(v).toLocaleString('cs-CZ',{maximumFractionDigits:d,minimumFractionDigits:d});
const btc = v => v.toLocaleString('cs-CZ',{minimumFractionDigits:4,maximumFractionDigits:4}) + ' BTC';
const fmtDate = s => { const [y,m,d]=s.split('-'); return `${+d}. ${+m}. ${y}`; };
const MONTHS=['led','úno','bře','dub','kvě','čvn','čvc','srp','zář','říj','lis','pro'];
let charts = [];




const L0 = ALL[ALL.length-1], TODAY = L0.d;
const HALVINGS = ['2028-11-20', '2032-11-20', '2036-11-20', '2040-11-20', '2044-11-20'];
const NEXT_HALVING = HALVINGS.find(d=>d>TODAY);
const subsidyRatio = d => 1/Math.pow(2, HALVINGS.filter(h => d >= h).length);
function addDays(s,n){ const d=new Date(s+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
const daysBetween = (a,b) => Math.round((Date.parse(b)-Date.parse(a))/864e5);
const pct = (v, d=0) => v===null ? '—' : (v*100).toLocaleString('cs-CZ',{maximumFractionDigits:d}) + ' %';
const sats = v => Math.round(v*1e8).toLocaleString('cs-CZ') + ' sats';
const yrs = d => { const y = d/365; return y < 1 ? `${Math.round(d/30.4)} měsíců` : `${y.toLocaleString('cs-CZ',{minimumFractionDigits:1,maximumFractionDigits:1})} roku`; };
const KS = 840, W = 2780;
/*@include zpath.js*/
// scenarios [name, ZEC z1, ZEC z2, colour, BTC]; ZEC after the pump as in the calculator's defaults (see zpath.js)
const SCN_DEF = [['Propad po pumpě jako LTC 2017; BTC +10 %',{k3:.30,k12:.08,k24:.08},-.10,'--s2',.10],['Stagnace ZEC 0 %',0,0,'--fg2'],
  ['Pokles po pumpě, medián minulých pump',{k3:.35,k12:.15,k24:.12},0,'--s1'],['Mírný pokles po pumpě jako DOGE 2024',{k3:.45,k12:.30,k24:.20},.10,'--s3']].map(s => [`${s[0]}: ${zPathTxt(s[1], s[2])}`, ...s.slice(1)]);
// with the scenario inputs of the main page present (calculator), the FAQ follows them: [name, BTC, ZEC ids]
const SCN_IN = [['Pesimistický','bB',{z1:'zB1', z2:'zB2', k3:'zB3', k12:'zB12', k24:'zB24', tr:'zBt'}], null,
  ['Základní','bM',{z1:'zM1', z2:'zM2', k3:'zM3', k12:'zM12', k24:'zM24', tr:'zMt'}], ['Optimistický','bU',{z1:'zU1', z2:'zU2', k3:'zU3', k12:'zU12', k24:'zU24', tr:'zUt'}]];
// break-even over time along the selected scenario: electricity that day (energy price steps yearly) / what the machine
// earns that day with the network grown by g a year (and following the price where the model says so), halvings included
const beSeries = (out, f, dH) => { const pts = [['za rok', 365], ['za 2 roky', 730]];
  if (dH > 0 && dH < out.length) pts.push([`po halvingu ${NEXT_HALVING.slice(0, 4)}`, dH]);
  return pts.filter(([, t]) => t < out.length).sort((a, b) => a[1]-b[1]).map(([l, t]) => `${l} ${f(out[t])}`).join(' · '); };
const pcs = v => `${v<0?'−':'+'}${Math.abs(Math.round(v*100))} %`;
function scnNow(){
  const v = (id, lo) => Math.max(lo, (parseFloat(document.getElementById(id)?.value) || 0)/100);
  if (!document.getElementById('bM')) return SCN_DEF;
  return SCN_DEF.map((s,i) => { const m = SCN_IN[i];
    if (!m) { const br = v('bM',-.9); return [`Stagnace ZEC 0 %; BTC ${pcs(br)} ročně`, 0, 0, s[3], br]; }
    const br = v(m[1],-.9), {z1, z2} = zScenIn('zShape', m[2]);
    return [`${m[0]}: ${zPathTxt(z1, z2)}; BTC ${pcs(br)}`, z1, z2, s[3], br]; });
}

function P(){
  const n = id => Math.max(0, parseFloat($(id).value) || 0), raw = id => parseFloat($(id).value) || 0;
  return {zec:n('zZec')||L0.z, btc:n('zBtc')||L0.p, kwh:n('zKwh'), fee:Math.min(.9,n('zFee')/100), up:Math.min(1,n('zUp')/100), hw:n('zHw'),
          g:raw('zHg')/100, g0:raw('zHg')/100, k:raw('zK'), br:Math.max(-.9,raw('zBtcR')/100), si:+($('zScen').value||2),
          q:netQ({mode:'zNetMode', up:'zNetUp', down:'zNetDown', c:'zNetEff'}, raw('zHg')/100)};
}
/*@include netmodel.js*/
const zTot = r => (r.mz-(r.fees||0))/.8 + (r.fees||0);   // all issued ZEC + fees a day (mz holds the miners' 80 %)
const NET_GAP = netGap(r => zTot(r)*r.z, r => r.hr);
const gEff = f => Math.pow(f[f.length-1], 365/(f.length-1)) - 1;
// machine bought today, 5 years: ZEC price path zRatio(z1, z2) (after the pump, or first year z1 then z2 a year), BTC +br a year,
// Zcash hashrate = today x (1+g)^t x (ZEC price ratio)^k, subsidy halves at the halving
function proj(p, z1, z2, g=p.g, years=5){
  const N = Math.round(365*years), eff = KS*p.up*(1-p.fee), elec = W/1000*24*p.kwh*p.up, out = [];
  // network: catch-up to the ZEC revenue of this price path, or fixed growth g with the price sensitivity k
  const fixed = p.gFixed || g !== p.g0 || p.q.mode !== 'catch';
  const zr = zRatio(z1, z2), zAt = t => p.zec*zr(t);
  const mzAt = d => (L0.mz-(L0.fees||0))*subsidyRatio(d)/subsidyRatio(TODAY)+(L0.fees||0);
  const F = netPath(N, t => Math.log(zTot({mz:mzAt(addDays(TODAY, t)), fees:L0.fees})*zAt(t)/(zTot(L0)*L0.z)), fixed ? {mode:'fixed', g} : {...p.q, g}, NET_GAP);
  let b=0, el=0, rev=0, firstLoss=null, payS=null, payH=null, btcPreH=0;
  for (let t=0; t<N; t++){
    const d = addDays(TODAY, t);
    const zp = zAt(t), bp = p.btc*Math.pow(1+p.br, t/365);
    const hr = L0.hr*F[t]*(fixed ? Math.pow(zp/p.zec, p.k) : 1);
    const zd = ((L0.mz-(L0.fees||0))*subsidyRatio(d)/subsidyRatio(TODAY)+(L0.fees||0))/(hr*1e6)*eff, m = zd*zp/bp;
    b += m; el += elec; rev += zd*zp; if (d < NEXT_HALVING) btcPreH = b;
    if (firstLoss===null && zd*zp < elec) firstLoss = d;
    if (payS===null && rev-el >= p.hw) payS = d;
    if (payH===null && b*bp-el >= p.hw) payH = d;
    out.push({d, zp, bp, zd, m, btc:b, el, stack:b*bp, hodl:b*bp-el, sell:rev-el});
  }
  const accounted = Economics.account(out,{hw:p.hw,elecDay:elec,energyGrowth:energyGrowth()});
  firstLoss = accounted.find(o => o.m*o.price < o.elecDay)?.d ?? null;
  payS = accounted.find(o => o.profitSell >= 0)?.d ?? null;
  payH = accounted.find(o => o.profitHold >= 0)?.d ?? null;
  accounted.forEach(o => o.be = o.elecDay/o.zd);
  return {out:accounted, btc:b, el:accounted.at(-1).el, elec, end:accounted.at(-1), firstLoss, payS, payH, btcPreH, gEff:gEff(F)};
}

/*@include edge.js*/
// "what would have to happen" for Z15 Pro: o = proj params + z1, z2 (ZEC path) and rs (resale share of hardware price)
function edgeSimZ(o){
  const {z1, z2, rs=0, ...pp} = o, pr = proj(pp, z1, z2);
  const cmp = Economics.compare(pr.out, {hw:pp.hw, elecDay:pr.elec, energyGrowth:energyGrowth()}), c = cmp.at(-1);
  return {mine:pr.end.stack+rs*pp.hw, spot:c.spotValue, dca:c.dcaValue, btcM:pr.btc, btcS:c.spot, btcD:c.dca, out:pr.out, cmp};
}
function renderEdgeZ(p, base){
  const n1 = v => v.toLocaleString('cs-CZ',{maximumFractionDigits:1}), n3 = v => v.toLocaleString('cs-CZ',{maximumFractionDigits:3});
  const sgn = v => (v<0?'−':'+')+n1(Math.abs(v)), money = x => '$'+Math.round(x).toLocaleString('cs-CZ');
  const o0 = {...base.pp, z1:base.z1, z2:base.z2}, gNow = p.q.mode === 'catch' ? base.gEff : o0.g;
  const LV = {
    kwh:  {n:'Cena elektřiny', cur:o0.kwh, set:(o,x)=>{o.kwh=x}, min:0, max:.5, step:.01, dir:'pod', fx:x=>n3(x)+' USD/kWh', ax:x=>n3(x)},
    z1:   {n:'Cena ZEC za první rok', cur:(zRatio(o0.z1, o0.z2)(365)-1)*100, set:(o,x)=>{o.z1=x/100}, min:-95, max:2000, step:10, dir:'nad', fx:x=>sgn(x)+' %', ax:x=>sgn(x)+' %'},
    z2:   {n:'Růst ceny ZEC v dalších letech', cur:o0.z2*100, set:(o,x)=>{o.z2=x/100}, min:-90, max:500, step:5, dir:'nad', fx:x=>sgn(x)+' % ročně', ax:x=>sgn(x)+' %'},
    zec:  {n:'Cena ZEC v den nákupu', cur:o0.zec, set:(o,x)=>{o.zec=x}, min:5, max:o0.zec*50, step:Math.max(10,o0.zec*.1), dir:'nad', fx:money, ax:x=>'$'+kfmt(x)},
    br:   {n:'Růst ceny BTC', cur:o0.br*100, set:(o,x)=>{o.br=x/100}, min:-90, max:500, step:5, dir:'pod', fx:x=>sgn(x)+' % ročně', ax:x=>sgn(x)+' %'},
    g:    {n:'Růst hashrate Zcash', cur:gNow*100, set:(o,x)=>{o.g=x/100; o.gFixed=true}, min:-90, max:Math.max(500, gNow*300), step:5, dir:'pod', fx:x=>sgn(x)+' % ročně', ax:x=>sgn(x)+' %'},
    hw:   {n:'Cena stroje', cur:o0.hw, set:(o,x)=>{o.hw=x}, min:0, max:o0.hw*20, step:Math.max(250,o0.hw*.1), dir:'pod', fx:money, ax:x=>'$'+kfmt(x)},
    fee:  {n:'Poplatek poolu', cur:o0.fee*100, set:(o,x)=>{o.fee=x/100}, min:0, max:90, step:2, dir:'pod', fx:x=>n1(x)+' %', ax:x=>n1(x)+' %'},
    rs:   {n:'Prodej stroje na konci 5 let', cur:0, set:(o,x)=>{o.rs=x/100}, min:0, max:5000, step:25, dir:'nad', fx:x=>`${Math.round(x)} % nákupní ceny`, ax:x=>Math.round(x)+' %', fx2:x=>` (≈ ${money(x/100*o0.hw)})`},
  };
  const VAR = [
    {t:'ZEC si udrží cenu po prudkém růstu', key:'z1', base:{},
     m:'ZEC během roku 2025–2026 vyrostl z desítek na více než tisíc USD. Pokud se cena v prvním roce po nákupu nezlomí, těžba vyplácí hodně BTC; korekce o desítky procent je ale po takovém růstu obvyklá.'},
    {t:'Síť Zcash přestane růst', key:'g', base:{},
     m:'Výkon sítě Zcash sleduje cenu ZEC: po růstu ceny přibývají stroje Z15 a Z15 Pro. Kdyby se nové stroje nedostaly na trh (omezená výroba Equihash ASICů) nebo by část minerů odešla, zbývající stroje dostávají větší podíl odměn.'},
    {t:'BTC roste pomaleji než ZEC', key:'br', base:{},
     m:'Pool vyplácí v BTC podle kurzu ZEC/BTC. Když BTC roste pomaleji, za stejné ZEC dostanete víc BTC, kdežto spot a DCA nakupují dražší BTC jen podle ceny BTC.'},
    {t:'Levná elektřina (0,03 USD/kWh) a pomalejší síť Zcash', key:'g', base:{kwh:.03},
     m:'Hosting na levném zdroji (vlastní FVE s přebytky, hydro, Skandinávie, Paraguay, Etiopie) a k tomu období, kdy síť Zcash roste pomalu.'},
    {t:'ZEC po korekci stagnuje, elektřina 0,05 USD/kWh, levnější stroj', key:'hw', base:{kwh:.05, z1:-.4, z2:0},
     m:'ZEC se po prudkém růstu propadne o 40 % a pak se cena nehýbe. Rozhoduje, za kolik stroj koupíte: ceny Equihash ASICů kolísají s cenou ZEC.'},
    {t:'Prodej stroje za vyšší cenu, než stál', key:'rs', base:{},
     m:'Ceny použitých strojů sledují výnosnost těžby. Při drahém ZEC se Z15 Pro prodávají i nad původní cenou, v medvědím trhu za zlomek. Po 5 letech a jednom halvingu ZEC je ale vysoká prodejní cena méně pravděpodobná.'},
  ];
  edgeSchedule({sim:edgeSimZ, o0, LV, VAR, scLabel:base.name.charAt(0).toLowerCase()+base.name.slice(1),
    combo:{t:'Souhra: levná energie, levnější stroj, ZEC drží cenu, pomalá síť', base:{kwh:.03, hw:Math.min(o0.hw,6000), z1:0, g:0},
      text:'Levný zdroj energie a cenu stroje lze ovlivnit. Aby ZEC držel cenu a síť zároveň nerostla, musel by ale trh s Equihash stroji zůstat omezený.'}});
}

function render(){
  const p = P(); charts.forEach(c=>c.destroy()); charts = [];
  const eff = KS*p.up*(1-p.fee), zecDay = L0.mz/(L0.hr*1e6)*eff, revDay = zecDay*p.zec, btcDay = revDay/p.btc;
  const elecDay = W/1000*24*p.kwh*p.up, netDay = revDay-elecDay, M = 30.44, bePrice = elecDay/zecDay;
  const dH = daysBetween(TODAY, NEXT_HALVING);
  const from12 = addDays(TODAY,-365), from6 = addDays(TODAY,-182);
  const hist = ALL.filter(r => r.d > from12).map(r => { const m = r.hv*eff; return {d:r.d, e:r.e, rev:m*r.p, el:elecDay, net:m*r.p-elecDay, btc:m, hp:r.hv*r.p*1000}; });
  const sum = (a,k) => a.reduce((s,x)=>s+x[k],0), h6 = hist.filter(x=>x.d>from6);
  const hps = hist.map(x=>x.hp), chg = hist.slice(1).map((x,i)=>Math.abs(x.hp/hist[i].hp-1)).sort((a,b)=>a-b), nets = hist.map(x=>x.net);
  const hr12 = ALL.find(r=>r.d===from12) || ALL[0];
  const SCN = scnNow(), sc = SCN.map(([name,z1,z2,col,br]) => { const pp = br===undefined?p:{...p,br}; return {name,z1,z2,col,pp,...proj(pp,z1,z2)}; });
  // payback after the 5-year window: same scenario run up to 15 years, so the tables show an exact date or "ani do <rok>"
  const LONG = 15, longY = +L0.d.slice(0,4) + LONG;
  sc.forEach(x => { if (x.payH && x.payS) return; const q = proj(x.pp, x.z1, x.z2, x.pp.g, LONG); x.payH = x.payH || q.payH; x.payS = x.payS || q.payS; });
  const base = sc[p.si];
  const comparison = Economics.compare(base.out,{hw:p.hw,elecDay:base.elec,energyGrowth:energyGrowth()});
  const lump = comparison.at(-1).spot, dcaAcc = comparison.at(-1).dca;
  const dcaS = comparison.map(o=>o.dca), lumpS = comparison.map(o=>o.spot);
  renderStrategyTable(base.out,p,base.elec);
  renderEdgeZ(p, base);
  const p10 = proj(base.pp, base.z1, base.z2, base.pp.g, 10);
  const fmtPay = x => x ? fmtDate(x) : `ani do ${longY}`;
  const V = {
    dcaCash: usd(comparison.at(-1).cash), sell5yHw: usd(base.end.sell-p.hw), roiHw: pct(Economics.roi(base.end.hodl-p.hw,p.hw)),
    today: fmtDate(TODAY), zec: usd(p.zec), btc: usd(p.btc), hw: usd(p.hw), fee: pct(p.fee), up: pct(p.up), btcR: (p.br>=0?'+':'')+pct(p.br),
    revDay: usd(revDay,2), elecDay: usd(elecDay,2), netDay: usd(netDay,2), revMonth: usd(revDay*M), elecMonth: usd(elecDay*M), netMonth: usd(netDay*M), netYear: usd(netDay*365),
    btcMonth: btc(btcDay*M), satsDay: sats(btcDay), zecDay: zecDay.toLocaleString('cs-CZ',{maximumFractionDigits:4}), hpMS: usd(L0.mz/(L0.hr*1e6)*1000*p.zec,2),
    paySimple: netDay>0 ? yrs(p.hw/netDay) : 'nikdy (stroj je ve ztrátě)', roiY: pct(Economics.roi(netDay*365,p.hw)),
    netHr: `${L0.hr.toLocaleString('cs-CZ',{maximumFractionDigits:1})} GSol/s`, hr12: `${hr12.hr.toLocaleString('cs-CZ',{maximumFractionDigits:1})} GSol/s`,
    hrGrowth12: (L0.hr/hr12.hr-1>=0?'+':'')+pct(L0.hr/hr12.hr-1),
    hpMin: usd(Math.min(...hps),2), hpMax: usd(Math.max(...hps),2), netMin: usd(Math.min(...nets),2), netMax: usd(Math.max(...nets),2), hpChg: pct(chg[Math.floor(chg.length/2)],1),
    netUp10: usd(revDay*1.1-elecDay,2), netDn10: usd(revDay*0.9-elecDay,2), netDiff10: usd(revDay/1.1-elecDay,2),
    bePrice: usd(bePrice), bePriceH: usd(base.out[Math.min(dH, base.out.length-1)].be), beMargin: pct(1-bePrice/p.zec),
    payBull: fmtPay(sc[3].payH), payFlat: fmtPay(sc[1].payH), payBase: fmtPay(sc[2].payH), payBear: sc[0].payH ? fmtDate(sc[0].payH) : `se nezaplatí ani do ${longY}`,
    btc5y: btc(base.btc), btcPreH: btc(base.btcPreH), cost5y: usd(p.hw+base.el), el5y: usd(base.el), costPerBtc: usd((p.hw+base.el)/base.btc), lump5y: btc(lump), dca5y: btc(dcaAcc),
    scName: SCN[p.si][0].charAt(0).toLowerCase()+SCN[p.si][0].slice(1), monthVal5y: usd(btcDay*M*base.end.bp), stack5y: usd(base.end.stack), hodl5yHw: usd(base.end.stack-base.el-p.hw),
    price5y: usd(base.end.bp), valMine: usd(base.end.stack), valLump: usd(lump*base.end.bp), valDca: usd(comparison.at(-1).dcaValue),
    btc10y: btc(p10.btc), btc6to10: btc(p10.btc-base.btc), el6to10: usd(p10.el-base.el),
    life0: btc(sc[0].btc), life1: btc(sc[1].btc), life2: btc(sc[2].btc), life3: btc(sc[3].btc),
    btc12: btc(sum(hist,'btc')), net12: usd(sum(hist,'net')), btc6: btc(sum(h6,'btc')), net6: usd(sum(h6,'net')),
    bearZec: usd(p.zec*0.3), bearEnd: usd(sc[0].end.hodl), bearStack: usd(sc[0].end.stack), bearInv: usd(sc[0].end.invested),
    bearLossTxt: sc[0].firstLoss ? `je stroj poprvé ve ztrátě ${fmtDate(sc[0].firstLoss)} a dál běží se ztrátou.` : 'stroj do ztráty nespadne ani po halvingu.',
  };
  document.querySelectorAll('[data-k]').forEach(e => { const v = V[e.dataset.k]; e.textContent = v===undefined ? '?' : v; });
  $('kpis').innerHTML = [
    ['Čistě za měsíc', usd(netDay*M), `výnos ${usd(revDay*M)} − elektřina ${usd(elecDay*M)}`, netDay],
    ['BTC za měsíc', btc(btcDay*M), `${sats(btcDay)} denně`],
    ['Bod zvratu, cena ZEC', usd(bePrice), `při dnešní síti; ${beSeries(base.out, o => usd(o.be), dH)} (zvolený scénář; ${p.q.mode === 'catch' ? `síť dohání tržby, v průměru ${pcs(base.gEff)} ročně` : `síť ${pcs(p.g)} ročně a sleduje cenu ZEC`})`, p.zec-bePrice],
  ].map(([l,v,s,sg]) => `<div class="kpi"><div class="l">${l}</div><div class="v ${sg===undefined?'':(sg>=0?'pos':'neg')}">${v}</div><div class="s">${s}</div></div>`).join('');

  $('tPay').innerHTML = `<thead><tr><th>Scénář ceny ZEC</th><th>ZEC za 5 let</th><th>Zaplacení, prodej</th><th>Zaplacení, držení</th><th>BTC za 5 let</th><th>Stack − zaplaceno</th><th>ROI všech vkladů za 5 let</th><th>První den ve ztrátě</th></tr></thead><tbody>`+
    sc.map(x=>`<tr><td><span class="sw" style="background:var(${x.col})"></span>${x.name}</td><td>${usd(x.end.zp)}</td><td>${fmtPay(x.payS)}</td><td>${fmtPay(x.payH)}</td><td>${btc(x.btc)}</td><td>${usd(x.end.hodl-p.hw)}</td><td class="${x.end.hodl>=p.hw?'pos':'neg'}">${pct(Economics.roi(x.end.hodl-p.hw,p.hw+x.el))}</td><td>${x.firstLoss?fmtDate(x.firstLoss):'–'}</td></tr>`).join('')+'</tbody>';

  const yrRows = []; for (let y=1; y<=5; y++){ const s0 = y===1?null:base.out[365*(y-1)-1], e = base.out[Math.min(base.out.length-1, 365*y-1)];
    const btcY = e.btc-(s0?s0.btc:0), elY = e.el-(s0?s0.el:0), sellY = e.sell-(s0?s0.sell:0);
    yrRows.push(`<tr><td>${y}. rok <span class="s">do ${fmtDate(e.d)}</span></td><td>${btc(btcY)}</td><td>${btc(e.btc)}</td><td>${usd(e.zp)}</td><td>${usd(e.bp)}</td><td>${usd(e.stack)}</td><td>${usd(elY)}</td><td>${usd(p.hw+e.el)}</td><td class="${e.stack>=p.hw+e.el?'pos':'neg'}">${usd(e.stack-p.hw-e.el)}</td><td class="${sellY>=0?'pos':'neg'}">${usd(sellY)}</td></tr>`); }
  $('tYears').innerHTML = `<thead><tr><th>Rok</th><th>Vyplaceno v roce</th><th>Stack celkem</th><th>Cena ZEC</th><th>Cena BTC</th><th>Hodnota stacku</th><th>Elektřina v roce</th><th>Zaplaceno celkem (stroj + elektřina)</th><th>Hodnota stacku − zaplaceno</th><th>Pro srovnání: čistě v roce při prodeji</th></tr></thead><tbody>${yrRows.join('')}</tbody>`;

  const byM = {}; hist.forEach(x => { const k = x.d.slice(0,7); (byM[k] ||= {k, n:0, btc:0, rev:0, el:0}); const o=byM[k]; o.n++; o.btc+=x.btc; o.rev+=x.rev; o.el+=x.el; });
  const MN = ['leden','únor','březen','duben','květen','červen','červenec','srpen','září','říjen','listopad','prosinec'];
  $('tHist').innerHTML = `<thead><tr><th>Měsíc</th><th>Dní</th><th>Vyplaceno</th><th>Výnos</th><th>Elektřina</th><th>Čistě</th></tr></thead><tbody>`+
    Object.values(byM).map(o=>`<tr><td>${MN[+o.k.slice(5)-1]} ${o.k.slice(0,4)}</td><td>${o.n}</td><td>${btc(o.btc)}</td><td>${usd(o.rev)}</td><td>${usd(o.el)}</td><td class="${o.rev>=o.el?'pos':'neg'}">${usd(o.rev-o.el)}</td></tr>`).join('')+'</tbody>';

  // ---- charts ----
  const L = hist.map(x=>x.d), LS = base.out.map(o=>o.d), yb = v=>v.toLocaleString('cs-CZ',{maximumFractionDigits:3});
  charts.push(new Chart($('cHist'), {type:'line', plugins:[zones,crosshair], options:opts(v=>'$'+v, v=>usd(v,2)), data:{labels:L, datasets:[
    line('Výnos', hist.map(x=>x.rev), css('--s1')), line('Elektřina', hist.map(x=>x.el), css('--s2')), line('Čistě', hist.map(x=>x.net), css('--s3'))]}}));
  charts.push(new Chart($('cVar'), {type:'line', plugins:[zones,crosshair], options:opts(v=>'$'+v, v=>usd(v,2)+' /MSol/den'), data:{labels:L, datasets:[
    line('Výnos za MSol', hps, css('--s1')), ref('Bod zvratu', L.map(()=>elecDay/eff*1000))]}}));
  const mon = {}; base.out.forEach(o => { const k = o.d.slice(0,7)+'-01'; (mon[k] ||= {k, n:0, btc:0, rev:0, el:0}); mon[k].n++; mon[k].btc += o.m; mon[k].rev += o.zd*o.zp; mon[k].el += o.elecDay; });
  Object.values(mon).forEach(o => { const f = 30.44/o.n; o.btc*=f; o.rev*=f; o.el*=f; });
  const MO = Object.values(mon).slice(1, -1);
  const monthlyX = o => { o.scales.x.ticks.callback = function(v){ const s=this.getLabelForValue(v); return s.slice(5,7)==='01' ? s.slice(0,4) : s.slice(5,7)==='07' ? 'čvc' : null; }; return o; };
  charts.push(new Chart($('cMonth'), {type:'line', plugins:[zones,crosshair], options:monthlyX(opts(v=>usd(v), v=>usd(v))), data:{labels:MO.map(o=>o.k), datasets:[
    line('Výnos', MO.map(o=>o.rev), css('--s1')), line('Elektřina', MO.map(o=>o.el), css('--s2')), line('Čistě', MO.map(o=>o.rev-o.el), css('--s3'))]}}));
  charts.push(new Chart($('cBtcM'), {type:'line', plugins:[zones,crosshair], options:monthlyX(opts(yb, v=>btc(v))), data:{labels:MO.map(o=>o.k), datasets:[
    line('BTC za měsíc', MO.map(o=>o.btc), css('--s1'), {fill:'origin', backgroundColor:css('--s1')+'22'})]}}));
  charts.push(new Chart($('cHodl'), {type:'line', plugins:[zones,crosshair], options:opts(yUsd, v=>usd(v)), data:{labels:LS, datasets:[
    line('Hodnota vyplacených BTC', base.out.map(o=>o.stack), css('--s1')), line('Tržby z průběžného prodeje', base.out.map(o=>o.rev), css('--s4'), {borderDash:[6,4], borderWidth:1.5}),
    ref('Vloženo celkem (stroj + energie)', base.out.map(o=>o.invested))]}}));
  charts.push(new Chart($('cRoi'), {type:'line', plugins:[zones,crosshair], options:opts(v=>v+' %', v=>Math.round(v)+' %'), data:{labels:LS, datasets:
    sc.map(x => line(x.name, x.out.map(o=>(Economics.roi(o.hodl-p.hw,p.hw+o.el)??0)*100), css(x.col))).concat([ref('Nula', LS.map(()=>0))])}}));
  const gs = [[0,'--s3'],[.1,'--s1'],[.3,'--s4'],[.6,'--s2']];
  charts.push(new Chart($('cHr'), {type:'line', plugins:[zones,crosshair], options:opts(yb, v=>btc(v)), data:{labels:LS, datasets:
    gs.map(([g,c]) => line(`Síť +${g*100} % ročně`, proj({...p, br:0, gFixed:true}, 0, 0, g).out.map(o=>o.btc), css(c)))}}));
  const linX = (o, lo, hi, title) => { o.scales.x = {type:'linear', min:lo, max:hi, grid:{display:false}, border:{color:css('--line')}, ticks:{color:css('--fg2'), callback:v=>'$'+kfmt(v), maxTicksLimit:8, font:{family:'IBM Plex Mono',size:11}}};
    o.plugins.tooltip.callbacks.title = it => `${title} ${usd(it[0].parsed.x)}`; return o; };
  const xz = []; for (let v=50; v<=3000; v+=25) xz.push(v);
  const zdH = zecDay*((L0.mz-(L0.fees||0))/2+(L0.fees||0))/L0.mz/Math.pow(1+p.g, dH/365);
  charts.push(new Chart($('cPrice'), {type:'line', plugins:[crosshair], options:linX(opts(v=>usd(v), v=>usd(v,2)), 50, 3000, 'Cena ZEC'), data:{datasets:[
    line('Dnes', xz.map(v=>({x:v, y:zecDay*v-elecDay})), css('--s1')), line('Po halvingu', xz.map(v=>({x:v, y:zdH*v-elecDay})), css('--s2')), ref('Nula', xz.map(v=>({x:v, y:0})))]}}));
  const xb = []; for (let v=20000; v<=500000; v+=10000) xb.push(v);
  charts.push(new Chart($('cEnd'), {type:'line', plugins:[crosshair], options:linX(opts(v=>yUsd(v), v=>usd(v)), 20000, 500000, 'BTC za 5 let'), data:{datasets:[
    line('Výsledek po 5 letech', xb.map(v=>({x:v, y:base.btc*v-base.el-p.hw})), css('--s3')), ref('Nula', xb.map(v=>({x:v, y:0})))]}}));
  charts.push(new Chart($('cHalv'), {type:'line', plugins:[zones,crosshair], options:opts(v=>kfmt(v), v=>Math.round(v).toLocaleString('cs-CZ')+' sats'), data:{labels:LS, datasets:[
    line('Sats za den', base.out.map(o=>o.m*1e8), css('--s1'))]}}));
  charts.push(new Chart($('cBe'), {type:'line', plugins:[zones,crosshair], options:opts(yUsd, v=>usd(v)), data:{labels:LS, datasets:
    [line('Bod zvratu', base.out.map(o=>o.be), css('--fg'), {borderDash:[6,4], borderWidth:2})].concat(sc.map(x => line(x.name, x.out.map(o=>o.zp), css(x.col), {borderWidth:1.5})))}}));
  charts.push(new Chart($('cVs'), {type:'line', plugins:[zones,crosshair], options:opts(yb, v=>btc(v)), data:{labels:LS, datasets:[
    line('Těžba', base.out.map(o=>o.btc), css('--s1')), line('Spot při ročních vkladech', lumpS, css('--s2')), line('Týdenní DCA', dcaS, css('--s3'))]}}));
  charts.push(new Chart($('cScen'), {type:'line', plugins:[zones,crosshair], options:opts(yUsd, v=>usd(v)), data:{labels:LS, datasets:
    sc.map(x => line(x.name, x.out.map(o=>o.stack), css(x.col))).concat([ref('Vloženo celkem (stroj + energie)', base.out.map(o=>o.invested))])}}));
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
