const ALL = DATA.rows, CM_END = DATA.cmEnd;
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const usd = (v, d=0) => (v<0?'−':'') + '$' + Math.abs(v).toLocaleString('cs-CZ',{maximumFractionDigits:d,minimumFractionDigits:d});
const btc = v => v.toLocaleString('cs-CZ',{minimumFractionDigits:4,maximumFractionDigits:4}) + ' BTC';
const fmtDate = s => { const [y,m,d]=s.split('-'); return `${+d}. ${+m}. ${y}`; };
const MONTHS=['led','úno','bře','dub','kvě','čvn','čvc','srp','zář','říj','lis','pro'];
let charts = [];



const TODAY = ALL[ALL.length-1].d;
const HALVINGS = ['2027-07-30', '2031-07-30', '2035-07-30', '2039-07-30', '2043-07-30'];
const NEXT_HALVING = HALVINGS.find(d=>d>TODAY);          // Litecoin, every 840 000 blocks of 2.5 min; Dogecoin has none
const ltcSub = d => 1/Math.pow(2, HALVINGS.filter(h => d >= h).length);
const SC = {bear:['Pesimistický','--s2','lbB','llB','ldB'], base:['Základní','--s1','lbM','llM','ldM'], bull:['Optimistický','--s3','lbU','llU','ldU']};
function addDays(s,n){ const d=new Date(s+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
const daysBetween = (a,b) => Math.round((Date.parse(b)-Date.parse(a))/864e5);
const pctv = (id, lo=-90, hi=500) => Math.min(hi, Math.max(lo, parseFloat($(id).value) || 0));

function params(){
  const n=id=>Math.max(0,parseFloat($(id).value)||0);
  return {start:$('start').value||'2024-05-15',hw:n('hwL'),kwh:n('kwh'),up:Math.min(1,n('uptime')/100),fee:Math.min(.9,n('poolFee')/100),th:n('th')||16.2,w:n('w')||3260};
}
function computeHistory(p,start){
  let btc=0,rev=0;
  const elecDay=p.w/1000*24*p.kwh*p.up;
  const rows=ALL.filter(r=>r.d>=start && r.d<=TODAY).map(r=>{const mined=r.hv*p.th*p.up*(1-p.fee);btc+=mined;rev+=mined*r.p;return {d:r.d,e:r.e,price:r.p,btc,rev};});
  return Economics.account(rows,{hw:p.hw,elecDay});
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
      ctx.beginPath(); ctx.moveTo(px,a.top); ctx.lineTo(px,a.bottom); ctx.stroke(); ctx.fillText('halving LTC', px+5, a.top+26); });
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
  const p=params(), available=ALL.filter(r=>r.d>=p.start && r.d<=TODAY);
  charts.forEach(c=>c.destroy());charts=[];if(!available.length)return;
  const elecDay=p.w/1000*24*p.kwh*p.up;
  const results=available.map(r=>{const rows=computeHistory(p,r.d),e=rows.at(-1),c=Economics.compare(rows,{hw:p.hw,elecDay}).at(-1);return {d:r.d,e,c};});
  const L=results.map(r=>r.d),beatH=results.filter(r=>r.c.spotValue>r.e.stack).length,nH=results.length;
  charts.push(new Chart($('l1'),{type:'line',plugins:[zones,crosshair],options:opts(yUsd,v=>usd(v)),data:{labels:L,datasets:[
    line('Těžba + držení: výsledek k datu dat',results.map(r=>r.e.profitHold),css('--s1')),
    line('Spot při ročních vkladech: výsledek k datu dat',results.map(r=>r.c.spotValue-r.c.invested),css('--s2'))]}}));
  const entries=LS.map(([id,k,col])=>({d:id==='ls1'?L[0]:$(id).value,k,col})).filter(e=>L.includes(e.d));
  const trajectories=entries.map(e=>{const rows=computeHistory(p,e.d),c=Economics.compare(rows,{hw:p.hw,elecDay});return {...e,rows,c};});
  charts.push(new Chart($('l2'),{type:'line',plugins:[zones,crosshair],options:opts(yUsd,v=>usd(v)),data:{labels:L,datasets:trajectories.map(e=>{
    const diff=new Map(e.rows.map((r,i)=>[r.d,r.stack-e.c[i].spotValue]));return line(`Vstup ${e.k}: těžba minus spot`,L.map(d=>diff.get(d)??null),css(e.col));}).concat([ref('Stejný výsledek',L.map(()=>0))])}}));
  $('leg2').innerHTML=entries.map(e=>`<span><i style="background:${css(e.col)}"></i>Vstup ${e.k}: ${fmtDate(e.d)}</span>`).join('');
  $('ltab').innerHTML='<thead><tr><th>Vstup</th><th>Vloženo</th><th>Těžba + držení: výsledek</th><th>Těžba + prodej: výsledek</th><th>Spot: výsledek</th><th>DCA včetně hotovosti: výsledek</th><th>Nevyčerpaná energie</th></tr></thead><tbody>'+trajectories.map(r=>{const e=r.rows.at(-1),c=r.c.at(-1);return `<tr><td>${r.k}: ${fmtDate(r.d)}</td><td>${usd(e.invested)}</td><td>${usd(e.profitHold)}</td><td>${usd(e.profitSell)}</td><td>${usd(c.spotValue-c.invested)}</td><td>${usd(c.dcaValue-c.invested)}</td><td>${usd(e.prepaid)}</td></tr>`;}).join('')+'</tbody>';
  $('budget').textContent=`${usd(p.hw+365*elecDay)} při vstupu, pak ${usd(365*elecDay)} každých 365 dní`;
  $('kpis').innerHTML=[['Konec backtestu',fmtDate(TODAY),'Pouze historická data, bez projekce'],['Stejný počáteční vklad',usd(p.hw+365*elecDay),'Stroj + první rok energie'],['Dny vstupu, kdy spot porazil těžbu',`${Math.round(beatH/nH*100)} %`,`do dneška ${beatH} z ${nH} dní; nejde o pravděpodobnost budoucího úspěchu`]].map(([l,v,t])=>`<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${t}</div></div>`).join('');
  renderStrategyTable(computeHistory(p,L[0]),p,elecDay);
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
