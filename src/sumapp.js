const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let chart;
const V = {{CHART}};
// the overview of the calculators replaces a machine's values with the live ones from its calculator
window.sumSet = (i, vals) => { V[i] = vals; render(); };
function render(){
  if (chart) chart.destroy();
  const v = V;
  const ds = [['Nejhorší','--s2'],['Základní','--s1'],['Nejlepší','--s3']].map(([l,c],i) => ({label:l, data:v.map(r=>r[i]), backgroundColor:css(c), borderRadius:4, borderSkipped:false, barPercentage:.8, categoryPercentage:.7}));
  const fmt = x => (x<0?'−':'+')+'$'+Math.abs(Math.round(x)).toLocaleString('cs-CZ');
  chart = new Chart(document.getElementById('cSum'), {type:'bar', data:{labels:['S21 XP','Z15 Pro','L9'], datasets:ds},
    options:{responsive:true, maintainAspectRatio:false, animation:false, plugins:{legend:{display:false},
      tooltip:{backgroundColor:css('--panel'), titleColor:css('--fg'), bodyColor:css('--fg2'), borderColor:css('--line'), borderWidth:1, callbacks:{label:it=>` ${it.dataset.label}: ${fmt(it.parsed.y)}`}}},
      scales:{x:{grid:{display:false}, ticks:{color:css('--fg2'), font:{family:'IBM Plex Sans', size:12}}, border:{color:css('--line')}},
              y:{grid:{color:css('--grid')}, border:{display:false}, ticks:{color:css('--fg2'), font:{family:'IBM Plex Mono', size:11}, callback:x=>(x<0?'−':'')+'$'+Math.abs(x/1000)+'k'}}}}});
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
new MutationObserver(render).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
render();
