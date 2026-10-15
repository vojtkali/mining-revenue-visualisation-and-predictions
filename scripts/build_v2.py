#!/usr/bin/env python3
"""Prototype of the redesigned machine page: one page with a parameter sidebar and tabs,
assembled from the existing main / FAQ / purchase-timing parts of a machine.

The three existing apps run unchanged, each in its own scope. The sidebar holds the main
app's inputs; the FAQ and timing apps keep hidden copies that are synced from it.

    python3 scripts/build_v2.py OUT.html
"""
import re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_site as B  # noqa: E402

M = dict(key='s21', name='S21 XP', title='Antminer S21 XP', data='btc', main=('body', 'app'), faq=('fbody', 'fapp'), lump=('lbody', 'lapp'),
         spec='270 TH/s · 3 645 W · SHA-256 · výplata v BTC', coin='BTC')
OTHER = [('S21 XP', None), ('Z15 Pro', 'https://claude.ai/artifact/Da2FmoaXTDHXKR36hHM7fN'), ('L9', 'https://claude.ai/artifact/EV6kP3pBeG4WnoPVSpGfAv')]


def sections(html):
    """{first id or h2 text: section html} for the top-level <section> blocks."""
    out = {}
    for m in re.finditer(r'<section[^>]*>.*?</section>', html, re.S):
        s = m.group(0)
        key = re.search(r'<section[^>]*id="([^"]+)"', s) or re.search(r'<canvas id="([^"]+)"', s) or re.search(r'<h[23]>([^<]+)', s)
        out[key.group(1)] = s
    return out


def rename_ids(html, js, ids, prefix, extra_js=()):
    for i in ids:
        html = re.sub(rf'\b(id|for)="{i}"', rf'\1="{prefix}{i}"', html)
        js = re.sub(rf"(['\"]){i}\1", rf'\1{prefix}{i}\1', js)
        js = re.sub(rf'#{i}\b', f'#{prefix}{i}', js)
    for i in extra_js:
        js = re.sub(rf'#{i}\b', f'#{prefix}{i}', js)
    return html, js


def scoped(js, mute_strategy=False):
    head = 'const renderStrategyTable=()=>{};\n' if mute_strategy else ''
    return '(()=>{\n' + head + js + '\n})();'


def strip_heading(sec):
    """Drop the numbered prefix of a card title ("3 · Těžba…" -> "Těžba…")."""
    return re.sub(r'(<h2>)\d+ · ', r'\1', sec, count=1)


def build():
    vals = B.page_values()
    fill = lambda t: B.fill(t, vals, 'v2')
    main_html, main_js = fill(B.read(M['main'][0] + '.html')), B.read(M['main'][1] + '.js')
    faq_html, faq_js = fill(B.read(M['faq'][0] + '.html')), B.read(M['faq'][1] + '.js')
    lump_html, lump_js = fill(B.read(M['lump'][0] + '.html')), B.read(M['lump'][1] + '.js')

    faq_html, faq_js = rename_ids(faq_html, faq_js, ['f', 'kpis'], 'F_')
    lump_html, lump_js = rename_ids(lump_html, lump_js, ['f', 'start', 'kwh', 'poolFee', 'uptime', 'hwS', 'th', 'w', 'kpis', 'budget', 'fl'], 'L_', extra_js=['fx'])

    def inputs(html):
        return {m.group(1): m.group(0) for m in re.finditer(r'<input id="([^"]+)"[^>]*>', html)}
    mi, fi = inputs(main_html), inputs(faq_html)
    sel = re.search(r'<select id="sc">.*?</select>', main_html, re.S).group(0)
    fsel = re.search(r'<select id="fScen3">.*?</select>', faq_html, re.S).group(0)
    lump_form = re.search(r'<form class="controls" id="L_f".*?</form>', lump_html, re.S).group(0)
    faq_form = re.search(r'<form class="controls" id="F_f".*?</form>', faq_html, re.S).group(0)
    # the FAQ's own copies of shared inputs stay hidden; its price input moves to the sidebar
    faq_hidden = faq_form.replace(fi['fPrice'], '')

    ms, fs, ls = sections(main_html), sections(faq_html), sections(lump_html)
    main_kpis = '<div class="kpis" id="kpis"></div>'
    lump_kpis = '<div class="kpis" id="L_kpis"></div>'

    def field(label, inp, unit='', hint=''):
        return (f'<label class="field"><span class="fl">{label}</span><span class="fi">{inp}<span class="u">{unit}</span></span>'
                + (f'<span class="hint">{hint}</span>' if hint else '') + '</label>')

    def bare(inp):  # strip label-era attributes we restyle
        return inp

    scen = ''.join(
        f'<div class="scen" data-sc="{k}" role="radio" tabindex="0" aria-checked="{"true" if k == "base" else "false"}">'
        f'<span class="sn"><i style="background:var({c})"></i>{n}</span>'
        f'<span class="sv"><span class="lbl">{M["coin"]}</span>{bare(mi[i])}<span class="u">% / rok</span></span></div>'
        for k, n, c, i in (('bear', 'Pesimistický', '--s2', 'yBear'), ('base', 'Základní', '--s1', 'yBase'), ('bull', 'Optimistický', '--s3', 'yBull')))

    sidebar = f'''<aside class="side" id="side">
<button class="side-toggle" id="sideToggle" type="button" aria-expanded="false" aria-controls="sideBody">Parametry výpočtu</button>
<div class="side-body" id="sideBody">
<form id="f" onsubmit="return false">
  <div class="sg"><h3>Scénář ceny</h3>
  <div class="scens" role="radiogroup" aria-label="Scénář ceny">{scen}</div>
  <p class="hint">Klik vybere scénář pro grafy. Procenta platí každý rok; pokles zadejte se znaménkem minus.</p></div>
  <div class="sg"><h3>Náklady</h3>
  {field('Elektřina', mi['kwh'], 'USD/kWh')}
  {field('Cena stroje', mi['hwS'], 'USD')}
  {field('Začátek těžby', mi['start'], '', 'Od kdy počítat historii a srovnání')}
  </div>
  <details class="sg adv" id="adv"><summary>Pokročilé</summary>
  {field('Poplatek poolu', mi['poolFee'], '%')}
  {field('Uptime', mi['uptime'], '%')}
  {field('Cena BTC dnes', fi['fPrice'], 'USD', 'Pro odpovědi v Otázkách')}
  <span hidden>{mi['th']}{mi['w']}</span>
  </details>
</form>
<form id="fx" onsubmit="return false">
  <details class="sg adv" id="adv2"><summary>Projekce</summary>
  {field('Odhad do', mi['end'])}
  {field('Růst hashrate sítě', mi['hgr'], '% / rok')}
  {field('Nárůst poplatků v bull marketu', mi['feeBull'], '%')}
  <span hidden>{sel}</span>
  </details>
</form>
<p class="spec">{M['spec']}</p>
<button type="button" class="reset" id="resetParams">Obnovit výchozí hodnoty</button>
</div>
</aside>'''

    engine = f'<div hidden id="engine">{faq_hidden}{lump_form}</div>'

    strategy = '<section class="card"><h2>Čtyři strategie při stejných vkladech</h2><p class="sub">Stejné peníze ve stejných dnech: stroj a první rok energie při dodání, další energie každých 365 dní. Spot nakupuje při každém vkladu, DCA rozkládá vklad do 53 týdenních nákupů. Nevyčerpané předplatné energie se nevrací.</p><div class="tbl"><table id="strategyTable"></table></div></section>'

    faq_groups = [k for k in fs if k not in ('Metodika',)]
    moved = {'navratnost', 'vsbtc'}
    toc = ''.join(f'<a href="#{g}">{re.search(r"<h2>(.*?)</h2>", fs[g]).group(1)}</a>' for g in faq_groups if g not in moved)

    tabs = [
        ('prehled', 'Přehled', f'''<div class="intro"><h2>Co stroj vydělá dnes</h2><p>Při dnešní ceně {M["coin"]} a výkonu sítě, po elektřině a poplatku poolu.</p></div>
<div class="kpis big" id="F_kpis"></div>
<div class="intro"><h2>Od začátku těžby do konce odhadu</h2><p>Historie od zvoleného začátku těžby a projekce ve vybraném scénáři (šedě podbarveno).</p></div>
{main_kpis}
{strip_heading(ms["c2"])}
{strip_heading(ms["c1"])}
{ms["c4"]}'''),
        ('navratnost', 'Návratnost', f'''<div class="intro"><h2>Kdy se stroj zaplatí</h2><p>Tři scénáře ceny vedle sebe. Procenta změníte v panelu vlevo.</p></div>
{strip_heading(ms["c5"])}
{fs["navratnost"]}'''),
        ('nakup', 'Těžba vs. nákup', f'''<div class="intro"><h2>Těžit, nebo koupit BTC?</h2><p>Stejné vklady ve stejných dnech pro těžbu, jednorázový nákup a týdenní DCA.</p></div>
{strategy}
<div class="grid2">{strip_heading(ms["c7"])}{strip_heading(ms["c8"])}</div>
<div class="intro"><h2>Načasování nákupu v historii</h2><p>Jak by dopadla těžba proti nákupu BTC podle dne vstupu. Vlastní data vstupu zadáte níže.</p></div>
{lump_kpis}
{ls["l1"]}{ls["l2"]}
{fs["vsbtc"]}'''),
        ('otazky', 'Otázky', f'''<div class="intro row"><div><h2>Otázky a odpovědi</h2><p>Odpovědi se přepočítávají podle parametrů vlevo.</p></div>
<div class="qa-tools"><button type="button" id="qaCollapse">Sbalit vše</button><button type="button" id="qaExpand">Rozbalit vše</button></div></div>
<nav class="toc">{toc}</nav>
{"".join(fs[g] for g in faq_groups if g not in moved)}'''),
        ('metodika', 'Metodika', f'''<div class="intro"><h2>Data a metodika</h2></div>
<div class="notes-grid">{ms["Data a metodika"]}{fs["Metodika"]}{ls["Metodika"]}</div>'''),
    ]
    tabbar = ''.join(f'<button type="button" role="tab" id="t-{k}" aria-controls="p-{k}" aria-selected="{"true" if i == 0 else "false"}" data-tab="{k}">{n}</button>' for i, (k, n, _) in enumerate(tabs))
    panels = ''.join(f'<section class="panel" role="tabpanel" id="p-{k}" aria-labelledby="t-{k}"{"" if i == 0 else " hidden"}>{c}</section>' for i, (k, n, c) in enumerate(tabs))
    machines = ''.join(f'<span class="m on" aria-current="page">{n}</span>' if u is None else f'<a class="m" href="{u}">{n}</a>' for n, u in OTHER)

    head = Path(__file__).resolve().parent.parent / 'src' / 'v2head.html'
    # economics.js formats its strategy table with the apps' usd()/btc(), which are scoped now
    GLOBAL_FMT = '\n'.join('var ' + l[len('const '):] for l in main_js.splitlines() if l.startswith(('const usd =', 'const btc =')))
    page = f'''{head.read_text(encoding="utf-8")}
<header class="top"><div class="top-in">
  <div class="brand"><b>Těžba</b><span class="sep">/</span><span>{M["title"]}</span></div>
  <nav class="machines" aria-label="Stroj">{machines}</nav>
  <span class="asof">Data k {vals["LAST"]}</span>
</div>
<div class="tabs-in"><div class="tabs" role="tablist" aria-label="Části">{tabbar}</div></div></header>
<div class="layout">{sidebar}<main class="main">{panels}</main></div>
{engine}
{B.CHART}
<script>{V2_PRE}</script>
<script>{B.read("economics.js")}</script>
<script>const DATA={B.embedded_data(M["data"])};
{GLOBAL_FMT}
{scoped(main_js)}
{scoped(faq_js, mute_strategy=True)}
{scoped(lump_js, mute_strategy=True)}
</script>
<script>{V2_POST}</script>'''
    return page


# runs before the apps: Q&A blocks become collapsible (open), tab switching
V2_PRE = r'''
document.querySelectorAll('.qa').forEach(q => {
  const h = q.querySelector(':scope > h3'); if (!h) return;
  const d = document.createElement('details'); d.className = q.className; d.open = true;
  const s = document.createElement('summary'); s.append(h); d.append(s);
  while (q.firstChild) d.append(q.firstChild);
  q.replaceWith(d);
});
'''

# runs after the apps: sidebar -> hidden FAQ/timing inputs, scenario cards, tabs, remembered state
V2_POST = r'''
(() => {
const $ = id => document.getElementById(id);
const store = { get(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(e) { return null; } },
                set(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} } };
const KEY = 'v2-s21';
const SYNC = {kwh:['fKwh','L_kwh'], poolFee:['fFee','L_poolFee'], uptime:['fUp','L_uptime'], hwS:['fHwS','L_hwS'], start:['L_start'], hgr:['fHg']};
const SIDE = [...document.querySelectorAll('#f input, #fx input, #fx select')];
const DEFAULTS = Object.fromEntries(SIDE.map(i => [i.id, i.defaultValue ?? i.value]));
DEFAULTS.sc = 'base';
const fire = el => el && el.dispatchEvent(new Event('input', {bubbles:true}));
function sync(){
  for (const [src, dsts] of Object.entries(SYNC)) for (const d of dsts) { const e = $(d); if (e) e.value = $(src).value; }
  $('fScen3').value = {bear:0, base:1, bull:2}[$('sc').value] ?? 1;
  fire($('fKwh')); fire($('L_kwh'));
  store.set(KEY, Object.fromEntries(SIDE.map(i => [i.id, i.value])));
}
function markScen(){
  document.querySelectorAll('.scen').forEach(c => { const on = c.dataset.sc === $('sc').value; c.classList.toggle('on', on); c.setAttribute('aria-checked', on); });
}
function pickScen(k){ $('sc').value = k; markScen(); fire($('sc')); }
document.querySelectorAll('.scen').forEach(c => {
  c.addEventListener('click', e => { if (e.target.tagName !== 'INPUT') pickScen(c.dataset.sc); });
  c.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === c) { e.preventDefault(); pickScen(c.dataset.sc); } });
});
SIDE.forEach(i => i.addEventListener('input', sync));
$('resetParams').addEventListener('click', () => {
  SIDE.forEach(i => { if (i.id in DEFAULTS) i.value = DEFAULTS[i.id]; });
  markScen(); fire($('kwh')); fire($('end'));
});
// restore remembered parameters
const saved = store.get(KEY);
if (saved) { SIDE.forEach(i => { if (saved[i.id] !== undefined) i.value = saved[i.id]; }); fire($('kwh')); fire($('end')); }
markScen(); sync();

const hdr = () => document.documentElement.style.setProperty('--hdr', document.querySelector('.top').offsetHeight + 'px');
hdr(); window.addEventListener('resize', hdr);
// tabs
const tabs = [...document.querySelectorAll('[role=tab]')];
function show(k, focus){
  tabs.forEach(t => { const on = t.dataset.tab === k; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; $('p-' + t.dataset.tab).hidden = !on; if (on && focus) t.focus(); });
  store.set(KEY + '-tab', k);
  try { if (location.hash.slice(1) !== k) history.replaceState(null, '', '#' + k); } catch(e) {}
  window.scrollTo({top: 0});
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => show(t.dataset.tab));
  t.addEventListener('keydown', e => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) show(tabs[(i + d + tabs.length) % tabs.length].dataset.tab, true); });
});
const start = location.hash.slice(1);
show(tabs.some(t => t.dataset.tab === start) ? start : (store.get(KEY + '-tab') || 'prehled'));
// links inside the FAQ to a group: switch tab first
document.querySelectorAll('.toc a').forEach(a => a.addEventListener('click', e => {
  e.preventDefault(); const t = document.querySelector(a.getAttribute('href')); t && t.scrollIntoView({behavior: 'smooth', block: 'start'});
}));

// Q&A collapse/expand all
$('qaCollapse').addEventListener('click', () => document.querySelectorAll('details.qa').forEach(d => d.open = false));
$('qaExpand').addEventListener('click', () => document.querySelectorAll('details.qa').forEach(d => d.open = true));

// sidebar: collapsible on narrow screens, advanced sections remember their state
const st = $('sideToggle');
st.addEventListener('click', () => { const open = st.getAttribute('aria-expanded') !== 'true'; st.setAttribute('aria-expanded', open); $('side').classList.toggle('open', open); });
['adv', 'adv2'].forEach(id => { const d = $(id), k = KEY + '-' + id; if (store.get(k)) d.open = true; d.addEventListener('toggle', () => store.set(k, d.open)); });
})();
'''

if __name__ == '__main__':
    Path(sys.argv[1]).write_text(build(), encoding='utf-8')
    print('wrote', sys.argv[1])
