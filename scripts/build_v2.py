#!/usr/bin/env python3
"""Prototype of the redesigned machine page: one page with a parameter sidebar and tabs,
assembled from the existing main / FAQ / purchase-timing parts of a machine.

The three existing apps run unchanged, each in its own scope. The sidebar holds the main
app's inputs; the FAQ and timing apps keep hidden copies that are synced from it.

    python3 scripts/build_v2.py OUT_DIR      # s21.html, z15.html, l9.html
"""
import json, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_site as B  # noqa: E402

# Per machine: page parts, the main app's input ids, the FAQ's hidden copies (synced from the sidebar),
# scenario fields shown on each scenario card, and the FAQ scenario index for bear/base/bull.
MACHINES = {
  's21': dict(name='S21 XP', title='Antminer S21 XP', data='btc', main=('body', 'app'), faq=('fbody', 'fapp'), lump=('lbody', 'lapp'),
    spec='270 TH/s · 3 645 W · SHA-256 · výplata v BTC', today='Při dnešní ceně BTC a výkonu sítě, po elektřině a poplatku poolu.',
    hw='hwS', hg='hgr', faq_sel='fScen3', faq_si={'bear': 0, 'base': 1, 'bull': 2},
    sync={'kwh': ['fKwh'], 'poolFee': ['fFee'], 'uptime': ['fUp'], 'hwS': ['fHwS'], 'hgr': ['fHg']},
    prices=[('Cena BTC dnes', 'fPrice')],
    scen={'bear': [('BTC', 'yBear')], 'base': [('BTC', 'yBase')], 'bull': [('BTC', 'yBull')]},
    proj_extra=[('Nárůst poplatků v bull marketu', 'feeBull', '%')]),
  'z15': dict(name='Z15 Pro', title='Antminer Z15 Pro', data='zec', main=('zbody', 'zapp'), faq=('fzbody', 'fzapp'), lump=('zlbody', 'zlapp'),
    spec='840 kSol/s · 2 780 W · Equihash (Zcash) · výplata v BTC', today='Při dnešních cenách ZEC a BTC a výkonu sítě Zcash, po elektřině a poplatku poolu.',
    hw='hwz', hg='zhg', faq_sel='zScen', faq_si={'bear': 0, 'base': 2, 'bull': 3},
    sync={'kwh': ['zKwh'], 'poolFee': ['zFee'], 'uptime': ['zUp'], 'hwz': ['zHw'], 'zhg': ['zHg'], 'zk': ['zK'], 'bM': ['zBtcR']},
    prices=[('Cena ZEC dnes', 'zZec'), ('Cena BTC dnes', 'zBtc')],
    scen={'bear': [('ZEC 1. rok', 'zB1'), ('ZEC dál', 'zB2'), ('BTC', 'bB')], 'base': [('ZEC 1. rok', 'zM1'), ('ZEC dál', 'zM2'), ('BTC', 'bM')],
          'bull': [('ZEC 1. rok', 'zU1'), ('ZEC dál', 'zU2'), ('BTC', 'bU')]},
    proj_extra=[('Citlivost hashrate na cenu ZEC', 'zk', '')]),
  'l9': dict(name='L9', title='Antminer L9', data='l9', main=('l9body', 'l9app'), faq=('l9fbody', 'l9fapp'), lump=('l9lbody', 'l9lapp'),
    spec='16,2 GH/s · 3 260 W · Scrypt, merge mining LTC + DOGE · výplata v BTC', today='Při dnešních cenách LTC, DOGE a BTC a výkonu sítě, po elektřině a poplatku poolu.',
    hw='hwL', hg='lhg', faq_sel='qScen', faq_si={'bear': 0, 'base': 2, 'bull': 3},
    sync={'kwh': ['qKwh'], 'poolFee': ['qFee'], 'uptime': ['qUp'], 'hwL': ['qHwL'], 'lhg': ['qHg'], 'lk': ['qK'], 'lbM': ['qBtcR']},
    prices=[('Cena LTC dnes', 'qLtc'), ('Cena DOGE dnes', 'qDoge'), ('Cena BTC dnes', 'qBtc')],
    scen={'bear': [('LTC', 'llB'), ('DOGE', 'ldB'), ('BTC', 'lbB')], 'base': [('LTC', 'llM'), ('DOGE', 'ldM'), ('BTC', 'lbM')],
          'bull': [('LTC', 'llU'), ('DOGE', 'ldU'), ('BTC', 'lbU')]},
    proj_extra=[('Citlivost hashrate na ceny LTC a DOGE', 'lk', '')]),
}
# claude.ai links of the published calculators (None = not published yet)
LINKS = {'index': 'https://claude.ai/artifact/GjajZXcYDdL5dyNdzHUf2M', 's21': 'https://claude.ai/artifact/6tEzys5PUCArXZCpfADioK',
         'z15': 'https://claude.ai/artifact/Ka5NMmHAb96wUo8QGZ3wGX', 'l9': 'https://claude.ai/artifact/W9pPfWT5rML7CjGBtbPLpJ'}


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


def build(key):
    M = MACHINES[key]
    vals = B.page_values()
    fill = lambda t: B.fill(t, vals, 'v2')
    main_html, main_js = fill(B.read(M['main'][0] + '.html')), B.read(M['main'][1] + '.js')
    faq_html, faq_js = fill(B.read(M['faq'][0] + '.html')), B.read(M['faq'][1] + '.js')
    lump_html, lump_js = fill(B.read(M['lump'][0] + '.html')), B.read(M['lump'][1] + '.js')

    faq_html, faq_js = rename_ids(faq_html, faq_js, ['f', 'kpis'], 'F_')
    lump_html, lump_js = rename_ids(lump_html, lump_js, ['f', 'start', 'kwh', 'poolFee', 'uptime', M['hw'], 'th', 'w', 'kpis', 'budget', 'fl'], 'L_', extra_js=['fx'])

    def inputs(html):
        return {m.group(1): m.group(0) for m in re.finditer(r'<input id="([^"]+)"[^>]*>', html)}
    mi, fi = inputs(main_html), inputs(faq_html)
    sel = re.search(r'<select id="sc">.*?</select>', main_html, re.S).group(0)
    lump_form = re.search(r'<form class="controls" id="L_f".*?</form>', lump_html, re.S).group(0)
    faq_form = re.search(r'<form class="controls" id="F_f".*?</form>', faq_html, re.S).group(0)
    # the FAQ's own copies of shared inputs stay hidden; its price inputs move to the sidebar
    faq_hidden = faq_form
    for _, pid in M['prices']:
        faq_hidden = faq_hidden.replace(fi[pid], '')

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
        + ''.join(f'<span class="sv"><span class="lbl">{lbl}</span>{bare(mi[i])}<span class="u">{"%" if "1. rok" in lbl else "% / rok"}</span></span>' for lbl, i in M['scen'][k])
        + '</div>'
        for k, n, c in (('bear', 'Pesimistický', '--s2'), ('base', 'Základní', '--s1'), ('bull', 'Optimistický', '--s3')))

    sidebar = f'''<aside class="side" id="side">
<button class="side-toggle" id="sideToggle" type="button" aria-expanded="false" aria-controls="sideBody">Parametry výpočtu</button>
<div class="side-body" id="sideBody">
<form id="f" onsubmit="return false">
  <div class="sg"><h3>Scénář ceny</h3>
  <div class="scens" role="radiogroup" aria-label="Scénář ceny">{scen}</div>
  <p class="hint">Klik vybere scénář pro grafy. Procenta platí každý rok; pokles zadejte se znaménkem minus.</p></div>
  <div class="sg"><h3>Náklady</h3>
  {field('Elektřina', mi['kwh'], 'USD/kWh')}
  {field('Cena stroje', mi[M['hw']], 'USD')}
  {field('Začátek těžby', mi['start'], '', 'Od kdy počítat historii a srovnání')}
  </div>
  <details class="sg adv" id="adv"><summary>Pokročilé</summary>
  {field('Poplatek poolu', mi['poolFee'], '%')}
  {field('Uptime', mi['uptime'], '%')}
  {''.join(field(lbl, fi[pid], 'USD', 'Pro odpovědi v Otázkách' if j == len(M['prices'])-1 else '') for j, (lbl, pid) in enumerate(M['prices']))}
  <span hidden>{mi['th']}{mi['w']}</span>
  </details>
</form>
<form id="fx" onsubmit="return false">
  <details class="sg adv" id="adv2"><summary>Projekce</summary>
  {field('Odhad do', mi['end'])}
  {field('Růst hashrate sítě', mi[M['hg']], '% / rok')}
  {''.join(field(lbl, mi[i], u) for lbl, i, u in M['proj_extra'])}
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
        ('prehled', 'Přehled', f'''<div class="intro"><h2>Co stroj vydělá dnes</h2><p>{M["today"]}</p></div>
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
    machines = ''.join(f'<span class="m on" aria-current="page">{m["name"]}</span>' if k == key else
                       (f'<a class="m" href="{LINKS[k]}">{m["name"]}</a>' if LINKS[k] else f'<span class="m off">{m["name"]}</span>') for k, m in MACHINES.items())
    brand = f'<a href="{LINKS["index"]}">Těžba</a>' if LINKS['index'] else '<b>Těžba</b>'
    cfg = dict(KEY='v2-' + key, SYNC={**{k: v + ([f'L_{k}'] if k in ('kwh', 'poolFee', 'uptime', M['hw']) else []) for k, v in M['sync'].items()}, 'start': ['L_start']},
               SEL=M['faq_sel'], SI=M['faq_si'])

    head = Path(__file__).resolve().parent.parent / 'src' / 'v2head.html'
    # economics.js formats its strategy table with the apps' usd()/btc(), which are scoped now
    GLOBAL_FMT = '\n'.join('var ' + l[len('const '):] for l in main_js.splitlines() if l.startswith(('const usd =', 'const btc =')))
    page = f'''{head.read_text(encoding="utf-8").replace('{{V2_TITLE}}', M['name'] + ' kalkulačka')}
<header class="top"><div class="top-in">
  <div class="brand">{brand}<span class="sep">/</span><span>{M["title"]}</span></div>
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
<script>{V2_POST.replace('__CFG__', json.dumps(cfg))}</script>'''
    return page


RISK = {'s21': 'Růst sítě a halving v dubnu 2028', 'z15': 'Pád ceny ZEC po prudkém růstu', 'l9': 'Cena DOGE, která tvoří většinu výnosu'}


def build_index():
    """Overview: one card per machine (numbers harvested off the FAQ pages) and the comparison from the summary page."""
    vals = B.page_values()
    sv = B.summary_values()
    rate = float(B.meta()['czk'])
    body = B.fill(B.read('sumbody.html'), {**sv, **vals}, 'v2 index')
    body = re.sub(r'<header>.*?</header>', '', body, count=1, flags=re.S)
    body = re.sub(r'\s*<h3>Podrobné stránky</h3>\s*<div class="links">.*?</div>', '<h3>Data</h3>', body, count=1, flags=re.S)
    body = body.replace('<div class="wrap">', '<div class="ov-body">', 1)
    cards = []
    for key, m in MACHINES.items():
        k = lambda n: sv[f'{key}.{n}']
        czk = round(B.num(k('netMonth')) * rate / 10) * 10
        val5 = re.search(r'<td class="(pos|neg)"><span class="n">(.*?)</span>', k('cellBase'))
        link = f'<a class="open" href="{LINKS[key]}">Otevřít kalkulačku</a>' if LINKS[key] else '<span class="open off">Kalkulačka se připravuje</span>'
        cards.append(f'''<article class="mcard">
  <header><h2>{m["title"]}</h2><p class="spec">{m["spec"]}</p></header>
  <dl>
    <div><dt>Čistě za měsíc dnes</dt><dd><span class="big">{k("netMonth")}</span><span class="czk">{B.sep(czk)} Kč</span></dd></div>
    <div><dt>BTC za měsíc</dt><dd><span class="big">{k("btcM")}</span><span class="czk">{k("netDay")} denně</span></dd></div>
    <div><dt>Zaplacení při držení BTC</dt><dd><span class="big sm">{k("payBase")}</span><span class="czk">základní scénář</span></dd></div>
    <div><dt>Za 5 let: BTC − vše zaplacené</dt><dd><span class="big {val5.group(1)}">{val5.group(2)}</span><span class="czk">základní scénář</span></dd></div>
  </dl>
  <p class="risk"><b>Hlavní riziko:</b> {RISK[key]}</p>
  {link}
</article>''')
    machines = ''.join(f'<a class="m" href="{LINKS[k]}">{m["name"]}</a>' if LINKS[k] else f'<span class="m off">{m["name"]}</span>' for k, m in MACHINES.items())
    head = (Path(__file__).resolve().parent.parent / 'src' / 'v2head.html').read_text(encoding='utf-8').replace('{{V2_TITLE}}', 'Přehled těžebních strojů')
    return f'''{head}
<header class="top"><div class="top-in">
  <div class="brand"><b>Těžba</b><span class="sep">/</span><span>Přehled strojů</span></div>
  <nav class="machines" aria-label="Stroj">{machines}</nav>
  <span class="asof">Data k {vals["LAST"]}</span>
</div></header>
<div class="overview">
<div class="intro"><h2>Tři stroje vedle sebe</h2><p>Dnešní výnos po elektřině a poplatku poolu, výplata v BTC. Elektřina $0,07/kWh, pool 20 %, uptime 95 %; základní scénář ceny. Podrobnosti a vlastní parametry jsou v kalkulačce každého stroje.</p></div>
<div class="mcards">{"".join(cards)}</div>
{body}
</div>
{B.CHART}
<script>{V2_PRE}</script>
<script>{B.fill(B.read('sumapp.js'), sv, 'v2 index')}</script>'''


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
const CFG = __CFG__, KEY = CFG.KEY, SYNC = CFG.SYNC;
const SIDE = [...document.querySelectorAll('#f input, #fx input, #fx select')];
const DEFAULTS = Object.fromEntries(SIDE.map(i => [i.id, i.defaultValue ?? i.value]));
DEFAULTS.sc = 'base';
const fire = el => el && el.dispatchEvent(new Event('input', {bubbles:true}));
function sync(){
  for (const [src, dsts] of Object.entries(SYNC)) for (const d of dsts) { const e = $(d); if (e) e.value = $(src).value; }
  $(CFG.SEL).value = CFG.SI[$('sc').value] ?? CFG.SI.base;
  fire($(SYNC.kwh[0])); fire($('L_kwh'));
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

PUBLIC_LINKS = {'index': 'index.html', 's21': 's21.html', 'z15': 'z15.html', 'l9': 'l9.html'}


def public_page(html):
    """Standalone HTML document for the website: own skeleton, no internal notes, old artifact links -> old pages."""
    html = re.sub(r'\s*<div class="verify">.*?</div>', '', html, flags=re.S)
    for a, b in B.PUBLIC_TEXT:
        html = html.replace(a, b)
    for art, page in B.ARTIFACT_LINKS.items():
        html = re.sub(r'https://claude\.ai/(code/)?artifact/' + art, '../' + page, html)
    assert 'claude.ai/artifact' not in html, 'unmapped artifact link'
    title = re.search(r'<title>.*?</title>', html).group(0)
    html = html.replace(title, '', 1)
    return ('<!doctype html><html lang="cs"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            f'{title}<style>:root{{color-scheme:light}}body{{margin:0;font:14px system-ui,-apple-system,"Segoe UI",sans-serif}}'
            'img{max-width:100%}[hidden]{display:none!important}</style></head><body>'
            f'{html}</body></html>\n')


def main():
    """python3 scripts/build_v2.py OUT_DIR             claude.ai artifact files (links between the published artifacts)
       python3 scripts/build_v2.py --public OUT_DIR    website pages (relative links), e.g. docs/v2"""
    public = sys.argv[1] == '--public'
    out = Path(sys.argv[-1]); out.mkdir(parents=True, exist_ok=True)
    if public:
        LINKS.update(PUBLIC_LINKS)
    pages = {f'{key}.html': (lambda k=key: build(k)) for key in MACHINES}
    pages['index.html'] = build_index
    for name, make in pages.items():
        html = make()
        (out / name).write_text(public_page(html) if public else html, encoding='utf-8')
        print('wrote', out / name)


if __name__ == '__main__':
    main()
