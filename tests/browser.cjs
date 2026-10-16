const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),chart=fs.readFileSync(path.join(path.dirname(require.resolve('chart.js')),'chart.umd.js'));
(async()=>{
 const browser=await chromium.launch(process.env.CHROMIUM?{executablePath:process.env.CHROMIUM}:{}),errors=[];
 try {
 for(const file of fs.readdirSync(path.join(ROOT,'docs')).filter(f=>f.endsWith('.html'))){
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  page.on('pageerror',e=>errors.push(file+': '+e.message));
  await page.route(/cdnjs\.cloudflare\.com/,r=>r.fulfill({body:chart,contentType:'application/javascript'}));
  await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
  await page.goto('file://'+path.join(ROOT,'docs',file));
  async function check(){
   const body=await page.locator('body').innerText();
   assert.ok(!/NaN|Infinity|undefined|\{\{/.test(body),file+' invalid output');
   if(file!=='index.html'){
    assert.equal(await page.locator('#strategyTable tbody tr').count(),4,file+' missing strategies');
    const cells=await page.locator('#strategyTable tbody tr').evaluateAll(rows=>rows.map(r=>[...r.children].map(x=>x.textContent)));
    assert.equal(new Set(cells.map(r=>r[1])).size,1,file+' unequal contributions');
    assert.ok((await page.locator('#kpis').innerText()).length>20);
   }
  }
  await check();
  if(file!=='index.html'){
   // Valid parameter edits exercise wiring, not only the default static build.
   const power=page.locator('#kwh,#fKwh,#zKwh,#qKwh');await power.fill('0');await check();
   await power.fill('0.1');await check();
   const growth=page.locator('#hgr,#fHg,#zhg,#zHg,#lhg,#qHg');
   if(await growth.count()){await growth.fill('45');await check();}
   const hw=page.locator('#hwS,#fHwS,#hwz,#zHw,#hwL,#qHwL');await hw.fill('0');await check();
   // No viewport-wide overflow on a phone; tables should scroll within their containers.
   await page.setViewportSize({width:390,height:844});
   await page.waitForFunction(()=>document.documentElement.scrollWidth<=window.innerWidth+2,{},{timeout:3000}).catch(async()=>{
    const overflow=await page.locator('body *').evaluateAll(els=>els.filter(e=>e.getBoundingClientRect().right>innerWidth+2 && getComputedStyle(e.parentElement).overflowX!=='auto').slice(0,12).map(e=>({tag:e.tagName,cls:e.className,width:e.getBoundingClientRect().width,text:e.textContent.slice(0,80)})));
    throw new Error(file+' mobile overflow: '+JSON.stringify(overflow));
   });
  }
  if(process.env.SCREENSHOT_DIR && file==='z15pro-faq.html'){
   await page.setViewportSize({width:1280,height:900});await page.locator('#strategyTable').screenshot({path:path.join(process.env.SCREENSHOT_DIR,'strategies.png')});
  }
  await page.close();console.log('checked',file);
 }
 // Calculators (docs/v2): Monte Carlo finishes on load and fills its tables, no invalid output
 const V2=path.join(ROOT,'docs','v2');
 for(const file of fs.existsSync(V2)?fs.readdirSync(V2).filter(f=>f.endsWith('.html')&&f!=='index.html'):[]){
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  page.on('pageerror',e=>errors.push('v2/'+file+': '+e.message));
  await page.route(/cdnjs\.cloudflare\.com/,r=>r.fulfill({body:chart,contentType:'application/javascript'}));
  await page.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
  await page.goto('file://'+path.join(V2,file));
  await page.waitForFunction(()=>/spočteno/.test(document.getElementById('mcStat').textContent),{},{timeout:20000});
  assert.equal(await page.locator('#mcTab tbody tr').count(),4,'v2/'+file+' Monte Carlo table');
  assert.ok((await page.locator('#rideTab tbody tr').count())===3,'v2/'+file+' Horská dráha table');
  assert.ok(!/NaN|Infinity|undefined|\{\{/.test(await page.locator('body').innerText()),'v2/'+file+' invalid output');
  await page.close();console.log('checked v2/'+file);
 }
 assert.deepEqual(errors,[]);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
