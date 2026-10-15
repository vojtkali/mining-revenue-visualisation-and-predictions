/* Shared cash-flow accounting. A row is the end of an operating day.
 * Funding arrives at delivery and every 365 days. Energy is prepaid for a whole
 * contractual year (including a final partial year); unused energy is disclosed
 * separately and is NOT assumed refundable. USD cash earns no interest.
 */
const Economics = (() => {
  const days = (a,b) => Math.round((Date.parse(b)-Date.parse(a))/864e5);
  const year = (start,date) => Math.floor(days(start,date)/365);
  const daily = (base,growth,start,date) => base*Math.pow(1+growth,year(start,date));
  const roi = (profit,capital) => capital>0 ? profit/capital : null;
  function account(rows,{hw,elecDay,start=rows[0]?.d,energyGrowth=0}) {
    let paid=0, consumed=0, previous=-1;
    return rows.map(row => {
      const y=year(start,row.d), day=daily(elecDay,energyGrowth,start,row.d);
      if(y<0) throw new Error('Row precedes delivery');
      for(let j=previous+1;j<=y;j++) paid+=365*elecDay*Math.pow(1+energyGrowth,j);
      previous=y; consumed+=day;
      const price=row.price??row.pr??row.bp;
      const rev=row.rev??(row.sell+row.el);
      const stack=row.btc*price, invested=hw+paid;
      return {...row,price,rev,stack,el:paid,elConsumed:consumed,elecDay:day,
        prepaid:Math.max(0,paid-consumed),invested,net:rev-paid,sell:rev-paid,
        hodl:stack-paid,profitHold:stack-invested,profitSell:rev-invested,
        roiTotal:roi(stack-invested,invested),roiHardware:roi(stack-invested,hw)};
    });
  }
  function compare(rows,{hw,elecDay,start=rows[0]?.d,energyGrowth=0}) {
    let spot=0,dca=0,cash=0,invested=0,previous=-1,allocation=0,spentThisYear=0;
    return rows.map(row => {
      const offset=days(start,row.d),y=Math.floor(offset/365),within=offset%365,price=row.price??row.pr??row.bp;
      if(y!==previous){
        if(y!==previous+1) throw new Error('Comparison requires contiguous daily rows');
        allocation=(y===0?hw:0)+365*elecDay*Math.pow(1+energyGrowth,y);
        invested+=allocation;spot+=allocation/price;cash+=allocation;spentThisYear=0;previous=y;
      }
      if(within%7===0){
        // 53 buys per contractual year: day 0, 7, ..., 364. Final buy uses the remainder.
        const spend=within===364?allocation-spentThisYear:allocation/53;
        dca+=spend/price;cash-=spend;spentThisYear+=spend;
      }
      if(Math.abs(cash)<1e-8)cash=0;
      return {d:row.d,spot,dca,cash,invested,spotValue:spot*price,dcaValue:dca*price+cash};
    });
  }
  return {days,daily,roi,account,compare};
})();
if(typeof module!=='undefined') module.exports=Economics;

function energyGrowth(){return Math.max(-.9,Math.min(3,parseFloat(document.getElementById('energyGrowth')?.value)||0))/100;}
function ratioText(v){return v===null?'—':(v*100).toLocaleString('cs-CZ',{maximumFractionDigits:1})+' %';}
function renderStrategyTable(rows,p,elecDay){
  const target=document.getElementById('strategyTable');if(!target||!rows.length)return;
  const comparison=Economics.compare(rows,{hw:p.hw,elecDay,energyGrowth:p.eg??energyGrowth()});
  const e=rows.at(-1),c=comparison.at(-1),paid=e.invested;
  const cases=[['Těžba + držení',e.btc,0,e.stack,e.prepaid],['Těžba + prodej',0,e.rev,e.rev,e.prepaid],
    ['Spot při ročních vkladech',c.spot,0,c.spotValue,0],['Týdenní DCA',c.dca,c.cash,c.dcaValue,0]];
  target.innerHTML='<thead><tr><th>Strategie</th><th>Vloženo USD</th><th>BTC</th><th>Hotovost USD</th><th>BTC + hotovost USD</th><th>Nevyčerpaná energie USD</th><th>Výsledek proti vkladům USD</th><th>ROI všech vkladů</th><th>Výsledek / cena stroje</th></tr></thead><tbody>'+cases.map(([name,b,cash,value,credit])=>
    `<tr><td>${name}</td><td>${usd(paid)}</td><td>${btc(b)}</td><td>${usd(cash)}</td><td>${usd(value)}</td><td>${usd(credit)}</td><td>${usd(value-paid)}</td><td>${ratioText(Economics.roi(value-paid,paid))}</td><td>${name.startsWith('Těžba')?ratioText(Economics.roi(value-paid,p.hw)):'—'}</td></tr>`).join('')+'</tbody>';
}
