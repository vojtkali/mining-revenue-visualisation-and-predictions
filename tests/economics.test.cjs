const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../src/economics.js');
const fs=require('fs'),vm=require('vm');
const date=i=>new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10);
const rows=n=>Array.from({length:n},(_,i)=>({d:date(i),price:100,btc:i+1,rev:100*(i+1)}));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('energy paid on delivery and exactly every 365 days, including partial final year',()=>{
 const r=E.account(rows(366),{hw:1000,elecDay:2});
 assert.equal(r[0].el,730);assert.equal(r[364].el,730);assert.equal(r[365].el,1460);
 near(r[0].prepaid,728);near(r[364].prepaid,0);near(r[365].prepaid,728);
 assert.equal(r[0].invested,1730);assert.equal(r[365].invested,2460);
});
test('annual tariffs lock within each year',()=>{
 const r=E.account(rows(366),{hw:1000,elecDay:2,energyGrowth:.1});
 near(r[364].elecDay,2);near(r[365].elecDay,2.2);near(r[365].el,730+803);
});
test('spot and DCA get identical funds, never spend future money; cash is included',()=>{
 const r=E.compare(rows(731),{hw:1000,elecDay:2});
 for(const x of r){near(x.spotValue,x.invested);near(x.dcaValue,x.invested);assert.ok(x.cash>=-1e-8)}
 near(r[0].spot,17.3);near(r[0].dca,17.3/53);
 near(r[364].cash,0);near(r[729].cash,0);near(r[730].invested,3190);
});
test('a longer horizon cannot alter earlier cashflows or purchases',()=>{
 const short=E.compare(rows(30),{hw:1000,elecDay:2});
 assert.deepEqual(short,E.compare(rows(730),{hw:1000,elecDay:2}).slice(0,30));
});
test('zero costs do not invent ROI, free energy does not create payments',()=>{
 const r=E.account(rows(366),{hw:0,elecDay:0});
 assert.equal(r[365].el,0);assert.equal(r[365].roiTotal,null);assert.equal(E.roi(100,0),null);
});
function load(name,asset,lastDate){
 const data=JSON.parse(fs.readFileSync(`data/derived/${asset}.json`));
 if(lastDate)data.rows=[{...data.rows.at(-1),d:lastDate}];
 const ctx=vm.createContext({DATA:data,document:{getElementById:()=>({value:'0'})}});
 vm.runInContext(fs.readFileSync('src/economics.js','utf8'),ctx);
 vm.runInContext(fs.readFileSync(`src/${name}.js`,'utf8').split('function render(){')[0],ctx);
 return expression=>vm.runInContext(expression,ctx);
}
test('ZEC projection after a halving does not halve its observed baseline again',()=>{
 const run=load('fzapp','zec','2029-01-01');
 const value=run(`(()=>{const p={zec:L0.z,btc:L0.p,kwh:.07,fee:.2,up:.95,hw:10000,g:0,k:0,br:0};return proj(p,0,0).out[1].zd/(L0.mz/(L0.hr*1e6)*840*.95*.8)})()`);near(value,1);
});
test('LTC projection after a halving does not halve its observed baseline again',()=>{
 const run=load('l9fapp','l9','2029-01-01');
 near(run(`(()=>{const p={ltc:L0.l,doge:L0.g,btc:L0.p,kwh:.07,fee:.2,up:.95,hw:7100,g:0,k:0,br:0};return proj(p,0).out[1].usd/((ltcPerGH*L0.l+dogePerGH*L0.g)*16.2*.95*.8)})()`),1);
});
test('ZEC fees survive halving and only subsidy is reduced',()=>{
 const run=load('fzapp','zec','2028-11-19');
 near(run(`(()=>{const p={zec:L0.z,btc:L0.p,kwh:0,fee:0,up:1,hw:1,g:0,k:0,br:0};const r=proj(p,0,0).out;return r[1].zd/r[0].zd-((L0.mz-L0.fees)/2+L0.fees)/L0.mz})()`),0);
});
test('all FAQ models use five annual payments, consistent ROI and reconciled cash',()=>{
 for(const [file,asset,p,call] of [
  ['fapp','btc',{price:80000,kwh:.07,fee:.2,up:.95,hw:7180,g:.3},'proj(p,.2)'],
  ['fzapp','zec',{zec:1100,btc:80000,kwh:.07,fee:.2,up:.95,hw:10000,g:.1,k:.3,br:.2},'proj(p,-.4,.1)'],
  ['l9fapp','l9',{ltc:60,doge:.08,btc:80000,kwh:.07,fee:.2,up:.95,hw:7100,g:.15,k:.3,br:.2},'proj(p,.1)']]){
  const run=load(file,asset);run('var p='+JSON.stringify(p));const r=run(call);
  near(r.el,5*365*r.elec);near(r.end.prepaid,0);assert.equal(r.out.length,1825);
  for(const x of r.out){near(x.profitHold,x.stack-x.invested);near(x.profitSell,x.rev-x.invested);near(x.roiTotal,x.profitHold/x.invested)}
 }
});
test('historical pages end on observed data and contain no future calculator',()=>{
 for(const [file,asset,th,w,hw] of [['lapp','btc',270,3645,7180],['zlapp','zec',840,2780,10000],['l9lapp','l9',16.2,3260,7100]]){
  const run=load(file,asset);const r=run(`computeHistory({hw:${hw},th:${th},w:${w},fee:.2,up:.95,kwh:.07},'2026-01-01')`);
  assert.equal(r.at(-1).d,run('TODAY'));assert.equal(run('typeof future'),'undefined');
 }
});
