// Read the computed numbers from the built FAQ and "vs. nákup" pages (default inputs)
// into data/derived/harvest.json; scripts/build_site.py fills the summary page from it.
//   node scripts/harvest.js            (needs: npm i playwright chart.js@4.4.1)
// CHROMIUM=/path/to/chromium overrides the browser, Chart.js is served from node_modules.
const {chromium} = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), DOCS = path.join(ROOT, 'docs');
const CHART = fs.readFileSync(path.join(path.dirname(require.resolve('chart.js')), 'chart.umd.js'));
const MACHINES = {s21: 's21xp', z15: 'z15pro', l9: 'l9'};

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? {executablePath: process.env.CHROMIUM} : {});
  const errors = [], out = {};
  async function open(file) {
    const p = await browser.newPage();
    p.on('pageerror', e => errors.push(`${file}: ${e.message}`));
    await p.route(/cdnjs\.cloudflare\.com/, r => r.fulfill({body: CHART, contentType: 'application/javascript'}));
    await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await p.goto('file://' + path.join(DOCS, file));
    await p.waitForTimeout(800);
    return p;
  }
  for (const [k, base] of Object.entries(MACHINES)) {
    let p = await open(`${base}-faq.html`);
    out[k] = await p.evaluate(() => {
      const v = {};
      document.querySelectorAll('[data-k]').forEach(e => v[e.dataset.k] = e.textContent.replace(/\s/g, ' '));
      const pay = [...document.querySelectorAll('#tPay tr')].map(r => [...r.children].map(c => c.textContent.replace(/\s+/g, ' ').trim()));
      const strategies = [...document.querySelectorAll('#strategyTable tbody tr')].map(r => [...r.children].map(c=>c.textContent));
      if(strategies.length!==4) throw new Error('Missing strategy accounting');
      v.sell5yHw=strategies[1][6];v.valSell=strategies[1][4];v.dcaCash=strategies[3][3];v.roiHw=strategies[0][8];
      return {v, pay};
    });
    await p.close();
    p = await open(`${base}-nakup.html`);
    const m = (await p.evaluate(() => document.body.textContent)).match(/do dneška (\d+) z (\d+) dní/);
    if (!m) errors.push(`${base}-nakup.html: KPI "do dneška X z Y dní" not found`);
    else out[k].lumpBeat = [+m[1], +m[2]];
    await p.close();
  }
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  fs.writeFileSync(path.join(ROOT, 'data', 'derived', 'harvest.json'), JSON.stringify(out, null, 1) + '\n');
  console.log('harvested', Object.keys(out).join(', '));
})();
