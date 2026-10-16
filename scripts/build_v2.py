#!/usr/bin/env python3
"""Prototype of the redesigned machine page: one page with a parameter sidebar and tabs,
assembled from the existing main / FAQ / purchase-timing parts of a machine.

The three existing apps run unchanged, each in its own scope. The sidebar holds the main
app's inputs; the FAQ and timing apps keep hidden copies that are synced from it.

    python3 scripts/build_v2.py OUT_DIR      # s21.html, z15.html, l9.html
"""
import json, math, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_site as B  # noqa: E402

# Per machine: page parts, the main app's input ids, the FAQ's hidden copies (synced from the sidebar),
# scenario fields shown on each scenario card, and the FAQ scenario index for bear/base/bull.
MACHINES = {
  's21': dict(name='S21 XP', title='Antminer S21 XP', data='btc', main=('body', 'app'), faq=('fbody', 'fapp'), lump=('lbody', 'lapp'),
    spec='270 TH/s · 3 645 W · SHA-256 · výplata v BTC', today='Při dnešní ceně BTC a výkonu sítě, po elektřině a poplatku poolu.',
    hw='hwS', hg='hgr', faq_sel='fScen3', faq_si={'bear': 0, 'base': 1, 'bull': 2},
    sync={'kwh': ['fKwh'], 'poolFee': ['fFee'], 'uptime': ['fUp'], 'hwS': ['fHwS'], 'hgr': ['fHg'], 'netMode': ['fNetMode'], 'netUp': ['fNetUp'], 'netDown': ['fNetDown'], 'netEff': ['fNetEff']},
    prices=[('Cena BTC dnes', 'fPrice')],
    scen={'bear': [('BTC', 'yBear')], 'base': [('BTC', 'yBase')], 'bull': [('BTC', 'yBull')]},
    proj_extra=[('Nárůst poplatků v bull marketu', 'feeBull', '%')],
    mc=dict(assets='BTC', corr='dlouhé trendy', net='Každá cesta má vlastní výkon sítě BTC: dohání tržby těžařů v této cestě stejně jako v projekci (poločas růstu podle panelu), takže po propadu ceny síť zpomalí a stroj natěží víc BTC.')),
  'z15': dict(name='Z15 Pro', title='Antminer Z15 Pro', data='zec', main=('zbody', 'zapp'), faq=('fzbody', 'fzapp'), lump=('zlbody', 'zlapp'),
    spec='840 kSol/s · 2 780 W · Equihash (Zcash) · výplata v BTC', today='Při dnešních cenách ZEC a BTC a výkonu sítě Zcash, po elektřině a poplatku poolu.',
    hw='hwz', hg='zhg', faq_sel='zScen', faq_si={'bear': 0, 'base': 2, 'bull': 3},
    sync={'kwh': ['zKwh'], 'poolFee': ['zFee'], 'uptime': ['zUp'], 'hwz': ['zHw'], 'zhg': ['zHg'], 'zk': ['zK'], 'bM': ['zBtcR'], 'netMode': ['zNetMode'], 'netUp': ['zNetUp'], 'netDown': ['zNetDown'], 'netEff': ['zNetEff']},
    prices=[('Cena ZEC dnes', 'zZec'), ('Cena BTC dnes', 'zBtc')],
    scen={'bear': [('ZEC 1. rok', 'zB1'), ('ZEC dál', 'zB2'), ('BTC', 'bB')], 'base': [('ZEC 1. rok', 'zM1'), ('ZEC dál', 'zM2'), ('BTC', 'bM')],
          'bull': [('ZEC 1. rok', 'zU1'), ('ZEC dál', 'zU2'), ('BTC', 'bU')]},
    proj_extra=[('Citlivost hashrate na cenu ZEC', 'zk', '')],
    mc=dict(assets='BTC a ZEC', corr='vazba mezi BTC a ZEC', net='Výnos v BTC sleduje poměr ZEC/BTC. Každá cesta má vlastní výkon sítě Zcash, který dohání tržby těžařů v této cestě stejně jako v projekci.')),
  'l9': dict(name='L9', title='Antminer L9', data='l9', main=('l9body', 'l9app'), faq=('l9fbody', 'l9fapp'), lump=('l9lbody', 'l9lapp'),
    spec='16,2 GH/s · 3 260 W · Scrypt, merge mining LTC + DOGE · výplata v BTC', today='Při dnešních cenách LTC, DOGE a BTC a výkonu sítě, po elektřině a poplatku poolu.',
    hw='hwL', hg='lhg', faq_sel='qScen', faq_si={'bear': 0, 'base': 2, 'bull': 3},
    sync={'kwh': ['qKwh'], 'poolFee': ['qFee'], 'uptime': ['qUp'], 'hwL': ['qHwL'], 'lhg': ['qHg'], 'lk': ['qK'], 'lbM': ['qBtcR'], 'netMode': ['qNetMode'], 'netUp': ['qNetUp'], 'netDown': ['qNetDown'], 'netEff': ['qNetEff']},
    prices=[('Cena LTC dnes', 'qLtc'), ('Cena DOGE dnes', 'qDoge'), ('Cena BTC dnes', 'qBtc')],
    scen={'bear': [('LTC', 'llB'), ('DOGE', 'ldB'), ('BTC', 'lbB')], 'base': [('LTC', 'llM'), ('DOGE', 'ldM'), ('BTC', 'lbM')],
          'bull': [('LTC', 'llU'), ('DOGE', 'ldU'), ('BTC', 'lbU')]},
    proj_extra=[('Citlivost hashrate na ceny LTC a DOGE', 'lk', '')],
    mc=dict(assets='BTC, LTC a DOGE', corr='vazby mezi BTC, LTC a DOGE', net='Výnos sleduje ceny LTC a DOGE vůči BTC. Každá cesta má vlastní výkon sítě Scrypt, který dohání tržby těžařů z LTC a DOGE v této cestě stejně jako v projekci.')),
}
# links between the pages: in the claude.ai artifact all pages are files of one artifact (index.html is a shell
# that shows them in frames and switches between them); the website build (--public) uses PUBLIC_LINKS
LINKS = {'index': 'overview.html', 's21': 's21.html', 'z15': 'z15.html', 'l9': 'l9.html'}


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


MC_ASSETS = {'s21': ['btc'], 'z15': ['btc', 'zec'], 'l9': ['btc', 'ltc', 'doge']}


def mc_returns(assets):
    """Daily log returns (x 1e5, rounded) of the closing prices in the versioned Coin Metrics snapshot,
    on the days all the assets have a price; the Monte Carlo draws its swings from these."""
    snap = json.loads((B.ROOT / 'data' / 'source' / 'coinmetrics.json').read_text())
    px = {a: {} for a in assets}
    for r in snap['data']:
        if r['asset'] in px:
            px[r['asset']][r['time'][:10]] = float(r['PriceUSD'])
    days = sorted(set.intersection(*(set(v) for v in px.values())))
    out = {a: [round(math.log(px[a][d] / px[a][p]) * 1e5) for p, d in zip(days, days[1:])] for a in assets}
    out['from'], out['to'] = days[0], days[-1]
    return json.dumps(out, separators=(',', ':'))


def mc_parts(key):
    M = MACHINES[key]
    t = B.read('mcbody.html')
    for k, v in M['mc'].items():
        t = t.replace('{{MC_' + k.upper() + '}}', v)
    assert '{{' not in t
    return {m.group(1): m.group(2) for m in re.finditer(r'<!--@(\w+)-->(.*?)(?=<!--@|\Z)', t, re.S)}


FONT_SWAP = [('IBM Plex Mono', 'Geist Mono'), ('IBM Plex Sans', 'Geist')]


def v2_fonts(js):
    for a, b in FONT_SWAP:
        js = js.replace(a, b)
    return js


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
        out = {m.group(1): m.group(0) for m in re.finditer(r'<input id="([^"]+)"[^>]*>', html)}
        out.update({m.group(1): m.group(0) for m in re.finditer(r'<select id="([^"]+)">.*?</select>', html, re.S)})
        return out
    mi, fi = inputs(main_html), inputs(faq_html)
    sel = re.search(r'<select id="sc">.*?</select>', main_html, re.S).group(0)
    lump_form = re.search(r'<form class="controls" id="L_f".*?</form>', lump_html, re.S).group(0)
    faq_form = re.search(r'<form class="controls" id="F_f".*?</form>', faq_html, re.S).group(0)
    # the FAQ's own copies of shared inputs stay hidden; its price inputs move to the sidebar
    faq_hidden = faq_form
    for _, pid in M['prices']:
        faq_hidden = faq_hidden.replace(fi[pid], '')

    ms, fs, ls = sections(main_html), sections(faq_html), sections(lump_html)
    mc = mc_parts(key)
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
  {field('Začátek těžby', mi['start'] + '<button type="button" class="today" id="startToday" title="Nejbližší možný den: jen projekce bez historie">Dnes</button>', '', 'Od kdy počítat historii a srovnání. „Dnes“ nastaví nejbližší možný den, výpočet je pak čistá projekce.')}
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
  {field('Odhad do', mi['end'], '', 'Nastaví se na začátek těžby + 4,5 roku; jde změnit ručně.')}
  {field('Model sítě', mi['netMode'], '', 'Dohánění: hashrate sleduje tržby těžařů se zpožděním (kalibrováno na 2017–2026). Pevný růst: stejné procento každý rok.')}
  {field('Poločas růstu sítě', mi['netUp'], 'dní')}
  {field('Poločas poklesu sítě', mi['netDown'], 'dní')}
  {field('Zlepšování strojů', mi['netEff'], '% / rok')}
  {field('Pevný růst sítě', mi[M['hg']], '% / rok', 'Jen pro model Pevný růst.')}
  {''.join(field(lbl, mi[i], u, 'Jen pro model Pevný růst.' if i in ('zk', 'lk') else '') for lbl, i, u in M['proj_extra'])}
  {field('Kolísání cen (Monte Carlo)', '<input id="mcVol" type="number" value="100" min="0" max="300" step="10">', '%', 'Jak silně ceny kolísají kolem scénáře: 100 % = jako denní pohyby od 5/2023, 0 % = hladká cesta.')}
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
{mc["navratnost"]}
{fs["navratnost"]}'''),
        ('nakup', 'Těžba vs. nákup', f'''<div class="intro"><h2>Těžit, nebo koupit BTC?</h2><p>Stejné vklady ve stejných dnech pro těžbu, jednorázový nákup a týdenní DCA.</p></div>
{strategy}
{mc["nakup"]}
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
<div class="notes-grid">{ms["Data a metodika"]}{mc["metodika"]}{fs["Metodika"]}{ls["Metodika"]}</div>'''),
    ]
    tabbar = ''.join(f'<button type="button" role="tab" id="t-{k}" aria-controls="p-{k}" aria-selected="{"true" if i == 0 else "false"}" data-tab="{k}">{n}</button>' for i, (k, n, _) in enumerate(tabs))
    panels = ''.join(f'<section class="panel" role="tabpanel" id="p-{k}" aria-labelledby="t-{k}"{"" if i == 0 else " hidden"}>{c}</section>' for i, (k, n, c) in enumerate(tabs))
    machines = ''.join(f'<span class="m on" aria-current="page">{m["name"]}</span>' if k == key else
                       (f'<a class="m" data-m="{k}" href="{LINKS[k]}">{m["name"]}</a>' if LINKS[k] else f'<span class="m off">{m["name"]}</span>') for k, m in MACHINES.items())
    brand = f'<a data-m="index" href="{LINKS["index"]}">Těžba</a>' if LINKS['index'] else '<b>Těžba</b>'
    cfg = dict(KEY='v2-' + key, SYNC={**{k: v + ([f'L_{k}'] if k in ('kwh', 'poolFee', 'uptime', M['hw']) else []) for k, v in M['sync'].items()}, 'start': ['L_start']},
               SEL=M['faq_sel'], SI=M['faq_si'])

    head = Path(__file__).resolve().parent.parent / 'src' / 'v2head.html'
    # economics.js formats its strategy table with the apps' usd()/btc(), which are scoped now
    GLOBAL_FMT = '\n'.join('var ' + l[len('const '):] for l in main_js.splitlines() if l.startswith(('const usd =', 'const btc =')))
    page = f'''{head.read_text(encoding="utf-8").replace('{{V2_TITLE}}', M['name'] + ' kalkulačka')}
<header class="top"><div class="top-in">
  <div class="brand">{brand}<span class="sep">/</span><span>{M["title"]}</span></div>
  <nav class="machines" aria-label="Stroj">{machines}</nav>
  <span class="startinfo">Začátek těžby <b id="startLbl"></b></span>
  <span class="asof">Data k {vals["LAST"]}</span>
  {THEME_BTN}
</div>
<div class="tabs-in"><div class="tabs" role="tablist" aria-label="Části">{tabbar}</div></div></header>
<div class="layout">{sidebar}<main class="main">{panels}</main></div>
{engine}
{B.CHART}
<script>{THEME_JS}</script>
<script>{V2_PRE}</script>
<script>{B.read("economics.js")}</script>
<script>const DATA={B.embedded_data(M["data"])};
const MCR={mc_returns(MC_ASSETS[key])};
{GLOBAL_FMT}
{v2_fonts(scoped(main_js + chr(10) + B.read('mc_' + key + '.js') + chr(10) + B.read('mc.js')))}
{v2_fonts(scoped(faq_js, mute_strategy=True))}
{v2_fonts(scoped(lump_js, mute_strategy=True))}
</script>
<script>{V2_POST.replace('__CFG__', json.dumps(cfg))}</script>'''
    # the FAQ points to the machine's old main page for the charts; here they are in the Přehled tab
    page = re.sub(r'Podrobné grafy jsou na stránce <a href="https://claude\.ai/(code/)?artifact/\w+">[^<]*</a>', 'Podrobné grafy jsou v záložce Přehled', page)
    return page


BASE = {'s21': 'BTC +20 % ročně', 'z15': 'ZEC −40 % v prvním roce, pak +10 % ročně; BTC +20 % ročně',
        'l9': 'LTC a DOGE +10 % ročně; BTC +20 % ročně'}
RISK = {'s21': 'Růst sítě a halving v dubnu 2028', 'z15': 'Pád ceny ZEC po prudkém růstu', 'l9': 'Cena DOGE, která tvoří většinu výnosu'}


def build_index():
    """Overview: one card per machine (numbers harvested off the FAQ pages) and the comparison from the summary page."""
    vals = B.page_values()
    sv = B.summary_values()
    rate = float(B.meta()['czk'])
    body = B.fill(B.read('sumbody.html'), {**sv, **vals}, 'v2 index')
    body = re.sub(r'<header>.*?</header>', '', body, count=1, flags=re.S)
    body = re.sub(r'\s*<h3>Podrobné stránky</h3>\s*<div class="links">.*?</div>', '<h3>Data</h3>', body, count=1, flags=re.S)
    body = body.replace('<div class="wrap">', '<div class="ov-body"><p class="hint ovnote" id="ovNote" hidden>Tabulky a graf níže (Ve zkratce, Návratnost, Těžit, nebo koupit) se v kalkulačkách řídí jejich nastavením. Ostatní odpovědi počítají s výchozími hodnotami a strojem koupeným v poslední den dat.</p>', 1)
    # links to the old per-machine pages lead to the machine's calculator instead (the calculator has all of it)
    old = {'s21xp.html': 's21', 'z15pro.html': 'z15', 'l9.html': 'l9'}
    for art, page in B.ARTIFACT_LINKS.items():
        if page in old:
            body = re.sub(r'href="https://claude\.ai/(code/)?artifact/' + art + '"', f'data-m="{old[page]}" href="{LINKS[old[page]]}"', body)
    cards = []
    for key, m in MACHINES.items():
        k = lambda n: sv[f'{key}.{n}']
        czk = round(B.num(k('netMonth')) * rate / 10) * 10
        val5 = re.search(r'<td class="(pos|neg)"><span class="n">(.*?)</span>', k('cellBase'))
        link = f'<a class="open" data-m="{key}" href="{LINKS[key]}">Otevřít kalkulačku</a>' if LINKS[key] else '<span class="open off">Kalkulačka se připravuje</span>'
        cards.append(f'''<article class="mcard">
  <header><h2>{m["title"]}</h2><p class="spec">{m["spec"]}</p></header>
  <dl>
    <div><dt>Čistě za měsíc dnes</dt><dd><span class="big">{k("netMonth")}</span><span class="czk">{B.sep(czk)} Kč</span></dd></div>
    <div><dt>BTC za měsíc</dt><dd><span class="big">{k("btcM")}</span><span class="czk">{k("netDay")} denně</span></dd></div>
    <div><dt>Zaplacení při držení BTC</dt><dd><span class="big sm" data-f="pay-{key}">{k("payBase")}</span><span class="czk" data-f="paysub-{key}">základní scénář</span></dd></div>
    <div><dt data-f="resl-{key}">Za 5 let: BTC − vše zaplacené</dt><dd><span class="big {val5.group(1)}" data-f="res-{key}">{val5.group(2)}</span><span class="czk" data-f="ressub-{key}">základní scénář</span></dd></div>
  </dl>
  <div class="mscn" data-f="tab-{key}"></div>
  <p class="risk" data-f="scn-{key}"><b>Základní scénář:</b> {BASE[key]}; stroj koupený {vals["LAST"]}, 5 let, výchozí parametry kalkulačky.</p>
  <p class="risk"><b>Hlavní riziko:</b> {RISK[key]}</p>
  {link}
</article>''')
    machines = ''.join(f'<a class="m" data-m="{k}" href="{LINKS[k]}">{m["name"]}</a>' if LINKS[k] else f'<span class="m off">{m["name"]}</span>' for k, m in MACHINES.items())
    head = (Path(__file__).resolve().parent.parent / 'src' / 'v2head.html').read_text(encoding='utf-8').replace('{{V2_TITLE}}', 'Přehled těžebních strojů')
    LAST_ISO = B.meta()['updated']
    MIN_START = min(json.loads(B.embedded_data(M['data']))['rows'][0]['d'] for M in MACHINES.values())
    return f'''{head}
<header class="top"><div class="top-in">
  <div class="brand"><b>Těžba</b><span class="sep">/</span><span>Přehled strojů</span></div>
  <nav class="machines" aria-label="Stroj">{machines}</nav>
  <span class="startinfo" title="Karty počítají se strojem koupeným v poslední den dat">Začátek těžby <b>{vals["LAST"]}</b></span>
  <span class="asof">Data k {vals["LAST"]}</span>
  {THEME_BTN}
</div></header>
<div class="overview">
<div class="intro"><h2>Tři stroje vedle sebe</h2><p id="ovIntro">Dnešní výnos po elektřině a poplatku poolu, výplata v BTC. Elektřina $0,07/kWh, pool 22 %, uptime 95 %. Návratnost a výsledek za 5 let počítají se strojem koupeným v poslední den dat a se základním scénářem cen každého stroje (je uveden na kartě). Podrobnosti a vlastní parametry jsou v kalkulačce každého stroje.</p>
<div class="ovstart" id="ovStartBox" hidden><label class="field"><span class="fl">Začátek těžby pro všechny stroje</span><span class="fi"><input type="date" id="ovStart" min="{MIN_START}" max="{LAST_ISO}"><button type="button" class="today" id="ovToday">Dnes</button></span><span class="hint">Nastaví začátek těžby ve všech třech kalkulačkách; konec odhadu se posune na začátek + 4,5 roku. Karty pak ukazují výsledky podle kalkulaček.</span></label></div></div>
<div class="mcards">{"".join(cards)}</div>
{body}
</div>
{B.CHART}
<script>{THEME_JS}</script>
<script>{V2_PRE}</script>
<script>{v2_fonts(B.fill(B.read('sumapp.js'), sv, 'v2 index'))}</script>
<script>{SUITE_CHILD}</script>'''


# day / night switch in the top bar: remembered per viewer, default follows the system setting
THEME_BTN = ('<button type="button" class="theme" id="themeBtn" aria-label="Přepnout denní a noční režim">'
             '<svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>'
             '<svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>'
             '<span class="tl"></span></button>')
THEME_JS = r"""
(() => {
  const root = document.documentElement, KEY = 'v2-theme';
  const sys = () => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  let saved = null; try { saved = localStorage.getItem(KEY); } catch (e) {}
  const current = () => root.getAttribute('data-theme') || sys();
  function label(){ const b = document.getElementById('themeBtn'); if (!b) return;
    const dark = current() === 'dark'; b.querySelector('.tl').textContent = dark ? 'Noční' : 'Denní';
    b.setAttribute('aria-pressed', dark); b.title = dark ? 'Přepnout na denní režim' : 'Přepnout na noční režim'; }
  if (saved === 'dark' || saved === 'light') root.setAttribute('data-theme', saved);
  document.addEventListener('DOMContentLoaded', label); label();
  document.addEventListener('click', e => {
    if (!e.target.closest('#themeBtn')) return;
    const next = current() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next); try { localStorage.setItem(KEY, next); } catch (err) {}
    label();
    // charts take their colours from the theme: redraw them (calculators re-render on an input event)
    const k = document.getElementById('kwh'); if (k) k.dispatchEvent(new Event('input', {bubbles:true}));
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', label);
  // another page of the same artifact may have switched the theme meanwhile: take the remembered one
  window.v2Theme = () => { let s = null; try { s = localStorage.getItem(KEY); } catch (e) {}
    if ((s === 'dark' || s === 'light') && s !== root.getAttribute('data-theme')){ root.setAttribute('data-theme', s); label();
      const k = document.getElementById('kwh'); if (k) k.dispatchEvent(new Event('input', {bubbles:true})); } };
})();
"""


# runs before the apps: Q&A blocks become collapsible (open), tab switching
V2_PRE = r'''
// chart look for the calculators: every chart the apps create gets the same quiet styling
(() => {
  const Base = window.Chart, tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const hexA = (h, a) => { const m = /^#([0-9a-f]{6})$/i.exec(h); if (!m) return h; const n = parseInt(m[1], 16);
    return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`; };
  function polish(cfg){
    const o = cfg.options || (cfg.options = {});
    o.layout = {padding:{top:8, right:6}};
    const tt = o.plugins && o.plugins.tooltip;
    if (tt){ Object.assign(tt, {cornerRadius:10, padding:12, caretSize:0, boxWidth:8, boxHeight:8, boxPadding:6, titleMarginBottom:8, bodySpacing:5,
      backgroundColor:tok('--panel'), borderColor:tok('--line'), borderWidth:1});
      tt.titleFont = {...(tt.titleFont||{}), family:'Geist', weight:'600', size:12.5};
      tt.bodyFont = {...(tt.bodyFont||{}), family:'Geist Mono', size:12.5}; }
    Object.values(o.scales || {}).forEach(sc => {
      sc.border = {...(sc.border||{}), display:false};
      if (sc.grid && sc.grid.display !== false) Object.assign(sc.grid, {color:tok('--grid'), drawTicks:false, lineWidth:1});
      if (sc.ticks) Object.assign(sc.ticks, {padding:8, color:tok('--muted'), font:{...(sc.ticks.font||{}), size:11.5}});
    });
    ((cfg.data && cfg.data.datasets) || []).forEach(d => {
      const t = d.type || cfg.type;
      if (t === 'line' && !d.borderDash){
        d.borderWidth = Math.max(d.borderWidth || 2, 2.25); d.borderCapStyle = 'round'; d.borderJoinStyle = 'round';
        if (d.pointHoverRadius !== 0) d.pointHoverRadius = 5;
        const col = d.borderColor;
        if (d.fill && typeof col === 'string' && col[0] === '#') d.backgroundColor = c => { const a = c.chart.chartArea; if (!a) return hexA(col, .15);
          const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom); g.addColorStop(0, hexA(col, .24)); g.addColorStop(1, hexA(col, 0)); return g; };
      }
      if (t === 'bar'){ d.borderRadius = d.borderRadius ?? 6; d.borderSkipped = false; }
    });
  }
  if (Base) window.Chart = class extends Base { constructor(item, cfg){ try { polish(cfg); } catch (e) {} super(item, cfg); } };
})();
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
$('startToday').addEventListener('click', () => { $('start').value = $('start').max; fire($('start')); });
// the projection ends 4.5 years after the mining start, so the next 4 years from the start stay in view;
// changing the start moves the end, the end can still be edited by hand afterwards
function endFromStart(){
  const s = $('start').value; if (!s) return;
  const d = new Date(s + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 54);
  let e = d.toISOString().slice(0, 10); const mn = $('end').min, mx = $('end').max;
  if (mn && e < mn) e = mn; if (mx && e > mx) e = mx;
  $('end').value = e;
}
$('start').addEventListener('input', () => { endFromStart(); fire($('end')); });
$('resetParams').addEventListener('click', () => {
  SIDE.forEach(i => { if (i.id in DEFAULTS) i.value = DEFAULTS[i.id]; });
  endFromStart(); markScen(); fire($('kwh')); fire($('end')); startLbl();
});
// restore remembered parameters (the first visit derives the end from the default start)
const saved = store.get(KEY);
if (saved) { SIDE.forEach(i => { if (saved[i.id] !== undefined) i.value = saved[i.id]; }); fire($('kwh')); fire($('end')); }
else { endFromStart(); fire($('end')); }
// top bar: show from when the mining is counted
const startLbl = () => { const v = $('start').value; if (v) $('startLbl').textContent = `${+v.slice(8,10)}. ${+v.slice(5,7)}. ${v.slice(0,4)}`; };
$('start').addEventListener('input', startLbl); $('start').addEventListener('change', startLbl);
markScen(); sync(); startLbl();

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
// switching machines keeps the place: the machine links carry #tab.block.offset (block = n-th card of the tab panel,
// offset = px scrolled into it), so the same card of the other machine opens at the same height
const hm = /^#(\w+)(?:\.(\d+)\.(-?\d+))?$/.exec(location.hash), start = hm ? hm[1] : '';
show(tabs.some(t => t.dataset.tab === start) ? start : (store.get(KEY + '-tab') || 'prehled'));
const hdrH = () => document.querySelector('.top').offsetHeight;
const curPanel = () => document.querySelector('.panel:not([hidden])');
function place(){
  const pn = curPanel(), kids = [...pn.children], h = hdrH();
  // anchor on the first card that starts below the header (cards differ in height between machines), else the one cut by it
  let i = kids.findIndex(c => c.getBoundingClientRect().top >= h - 1);
  if (i < 0 || (i > 0 && kids[i].getBoundingClientRect().top > innerHeight)) i = Math.max(0, kids.findIndex(c => c.getBoundingClientRect().bottom > h + 1));
  return `${pn.id.slice(2)}.${i}.${Math.round(h - kids[i].getBoundingClientRect().top)}`;
}
document.querySelectorAll('.machines a.m').forEach(a => a.addEventListener('click', () => { a.href = a.href.split('#')[0] + '#' + place(); }));
function goPlace(pl, fresh){
  const m = /^(\w+)\.(\d+)\.(-?\d+)$/.exec(pl || ''); if (!m) return;
  if (tabs.some(t => t.dataset.tab === m[1])) show(m[1]);
  let moved = false; ['wheel', 'touchstart', 'keydown'].forEach(ev => addEventListener(ev, () => moved = true, {once:true, passive:true}));
  const go = () => { if (moved) return; const el = curPanel().children[+m[2]]; if (!el) return;
    window.scrollTo({top: el.getBoundingClientRect().top + scrollY - hdrH() + (+m[3])}); };
  // on a fresh load charts and the Monte Carlo fill in later: place again once they have their size
  go(); if (fresh){ setTimeout(go, 60); setTimeout(go, 500); setTimeout(go, 1200); }
}
if (hm && hm[2] !== undefined) goPlace(hm[0].slice(1), true);   // show() has already rewritten the hash
// inside the one-artifact suite (index.html shows every page in a frame): machine links ask the shell to switch,
// handing over the place; the shell sends it back to the frame it shows
if (window.parent !== window){
  const key = KEY.slice(3), sendSum = () => window.v2Sum && parent.postMessage({type:'v2sum', key, sum:window.v2Sum}, '*');
  document.addEventListener('click', e => { const a = e.target.closest('a[data-m]'); if (!a) return; e.preventDefault();
    parent.postMessage({type:'v2switch', to:a.dataset.m, place:place()}, '*'); });
  addEventListener('v2sum', sendSum);   // the main app recalculated: the overview cards follow
  addEventListener('message', e => { if (e.source !== parent || !e.data) return;
    if (e.data.type === 'v2go'){ window.v2Theme && window.v2Theme(); goPlace(e.data.place); }
    if (e.data.type === 'v2start'){   // start set for all machines in the overview (clamped to this machine's data)
      const s = $('start'); let v = e.data.start; if (s.min && v < s.min) v = s.min; if (s.max && v > s.max) v = s.max;
      if (s.value !== v){ s.value = v; fire(s); startLbl(); } else sendSum(); }
  });
  parent.postMessage({type:'v2ready', key}, '*'); sendSum();
}
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

SUITE_CHILD = r'''
if (window.parent !== window){
  const $ = id => document.getElementById(id), F = n => document.querySelector(`[data-f="${n}"]`);
  const fmt = s => `${+s.slice(8,10)}. ${+s.slice(5,7)}. ${s.slice(0,4)}`;
  document.addEventListener('click', e => { const a = e.target.closest('a[data-m]'); if (!a) return; e.preventDefault();
    parent.postMessage({type:'v2switch', to:a.dataset.m}, '*'); });
  // one start date for all machines: sent to every calculator through the shell
  const box = $('ovStartBox'), inp = $('ovStart'); box.hidden = false;
  if ($('ovNote')) $('ovNote').hidden = false;
  // the field shows the start the calculators share; empty while they differ
  const starts = {};
  const send = () => { if (!inp.value) return;
    parent.postMessage({type:'v2start', start:inp.value}, '*'); };
  inp.addEventListener('change', send);
  $('ovToday').addEventListener('click', () => { inp.value = inp.max; send(); });
  // the cards follow the calculators (each with its own parameters and scenario)
  let live = false;
  addEventListener('message', e => { if (e.source !== parent || !e.data) return;
    if (e.data.type === 'v2go') window.v2Theme && window.v2Theme();
    if (e.data.type !== 'v2sum') return;
    const k = e.data.key, s = e.data.sum; if (!F('pay-' + k)) return;
    starts[k] = s.start; const all = Object.values(starts);
    if (document.activeElement !== inp) inp.value = all.length === 3 && all.every(v => v === all[0]) ? all[0] : '';
    if (!live){ live = true; $('ovIntro').textContent = 'Dnešní výnos po elektřině a poplatku poolu, výplata v BTC. Návratnost a výsledek na konci odhadu jsou podle nastavení každé kalkulačky: scénář a parametry má každý stroj svoje, začátek těžby lze nastavit všem najednou.'; }
    F('pay-' + k).textContent = s.pay; F('paysub-' + k).textContent = `při držení BTC; ${s.scen.toLowerCase()} scénář`;
    F('resl-' + k).textContent = `Do ${fmt(s.end)}: hodnota BTC − vše vložené`;
    const r = F('res-' + k); r.textContent = s.resTxt; r.classList.toggle('pos', s.res >= 0); r.classList.toggle('neg', s.res < 0);
    F('ressub-' + k).textContent = `${s.scen.toLowerCase()} scénář`;
    const tb = F('tab-' + k);   // all three scenarios of the calculator, the selected one highlighted
    if (tb && s.scens) tb.innerHTML = `<span class="h">Scénář</span><span class="h n">Zaplaceno</span><span class="h n">Do ${fmt(s.end)}</span>` +
      s.scens.map(x => { const c = x.sel ? ' sel' : '';
        return `<span class="lab${c}">${x.label}</span><span class="n${c}">${x.pay}</span><span class="n${c} ${x.res >= 0 ? 'pos' : 'neg'}">${x.resTxt}</span>`; }).join('');
    // the comparison below the cards: rows of the selected scenario and of all three, column = machine
    const j = ['s21', 'z15', 'l9'].indexOf(k), cell = (row, html, cls) => { const tr = F(row); if (!tr) return; const td = tr.children[j + 1]; if (td){ td.innerHTML = html; td.className = cls || ''; } };
    const th = (row, txt) => { const tr = F(row); if (tr) tr.children[0].textContent = txt; };
    cell('row-pay', s.pay); th('row-pay', 'Zaplacení při držení BTC, scénář vybraný v kalkulačce');
    cell('row-res', `<span class="n">${s.resTxt}</span>`, s.res >= 0 ? 'pos' : 'neg'); th('row-res', 'Na konci odhadu: hodnota BTC − všechno vložené');
    (s.scens || []).forEach((x, i) => { cell('scn-' + i, x.label); cell('pay-' + i, x.pay); });
    if (s.strat){ const mx = Math.max(...s.stratV); s.strat.forEach((x, i) => cell('st-' + i, s.stratV[i] === mx ? `<b><span class="n">${x}</span></b>` : `<span class="n">${x}</span>`)); }
    if (window.sumSet && s.scens) window.sumSet(j, s.scens.map(x => x.res));
    F('scn-' + k).innerHTML = `<b>Podle kalkulačky:</b> ${s.scen.toLowerCase()} scénář, stroj od ${fmt(s.start)} do ${fmt(s.end)}.`;
  });
  parent.postMessage({type:'v2ready', key:'index'}, '*');
}
'''

# the artifact's own page: shows the overview and the calculators (files of the same artifact) in frames, switches
# between them without reloading, remembers the last one; each frame keeps its own scroll position
SHELL = '''<title>Těžba: kalkulačky</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
:root{--bg:#f3f4f7}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#0d0f14}}
:root[data-theme="dark"]{--bg:#0d0f14}
html,body{margin:0;height:100%;background:var(--bg);overflow:hidden}
/* frames do not see the safe-area insets (the app's own bar on phones), so the shell keeps them out of it */
:root{--st:env(safe-area-inset-top,0px);--sl:env(safe-area-inset-left,0px);--sr:env(safe-area-inset-right,0px);--sb:env(safe-area-inset-bottom,0px)}
iframe{position:fixed;top:var(--st);left:var(--sl);width:calc(100% - var(--sl) - var(--sr));height:calc(100% - var(--st) - var(--sb));border:0;display:none;background:var(--bg)}
iframe.on{display:block}
</style>
<script>
(() => {
  const PAGES = {index:'overview.html', s21:'s21.html', z15:'z15.html', l9:'l9.html'}, TITLES = {index:'Přehled strojů', s21:'S21 XP', z15:'Z15 Pro', l9:'L9'};
  const fr = {}, KEY = 'v2-suite', sums = {}, ready = {}; let start = null;
  try { const t = localStorage.getItem('v2-theme'); if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t); } catch (e) {}
  const make = (k, place) => { if (fr[k]) return false; const f = document.createElement('iframe'); f.src = PAGES[k] + (place ? '#' + place : '');
    f.title = TITLES[k]; document.body.append(f); fr[k] = f; return true; };
  function show(k, place){
    if (!PAGES[k]) k = 'index';
    if (!make(k, place)) fr[k].contentWindow.postMessage({type:'v2go', place:place || ''}, '*');
    for (const [kk, f] of Object.entries(fr)) f.classList.toggle('on', kk === k);
    try { localStorage.setItem(KEY, k); } catch (e) {}
  }
  // every page is loaded (the overview cards are filled from the calculators); summaries and the shared start are
  // passed on, and kept for pages that are not ready yet
  const post = (k, msg) => { if (fr[k] && ready[k]) fr[k].contentWindow.postMessage(msg, '*'); };
  addEventListener('message', e => { const d = e.data; if (!d) return;
    const from = Object.keys(fr).find(k => fr[k].contentWindow === e.source); if (!from) return;
    if (d.type === 'v2switch') show(d.to, d.place);
    if (d.type === 'v2ready'){ ready[from] = true;
      if (from === 'index') Object.entries(sums).forEach(([key, sum]) => post('index', {type:'v2sum', key, sum}));
      else if (start) post(from, {type:'v2start', start}); }
    if (d.type === 'v2sum'){ sums[d.key] = d.sum; post('index', {type:'v2sum', key:d.key, sum:d.sum}); }
    if (d.type === 'v2start'){ start = d.start; ['s21', 'z15', 'l9'].forEach(k => post(k, {type:'v2start', start})); }
  });
  let k0 = 'index'; try { k0 = localStorage.getItem(KEY) || 'index'; } catch (e) {}
  document.addEventListener('DOMContentLoaded', () => { show(k0); setTimeout(() => Object.keys(PAGES).forEach(k => make(k)), 300); });
})();
</script>'''

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


def suite_page(html):
    """A page file inside the artifact: own skeleton; links that leave the artifact open in the whole window."""
    title = re.search(r'<title>.*?</title>', html).group(0)
    html = html.replace(title, '', 1)
    return ('<!doctype html><html lang="cs"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><base target="_top">'
            f'{title}<style>:root{{color-scheme:light}}body{{margin:0;font:14px system-ui,-apple-system,"Segoe UI",sans-serif}}'
            'img{max-width:100%}[hidden]{display:none!important}</style></head><body>'
            f'{html}</body></html>\n')


def main():
    """python3 scripts/build_v2.py OUT_DIR             one claude.ai artifact: index.html (shell) + overview/s21/z15/l9.html
       python3 scripts/build_v2.py --public OUT_DIR    website pages (relative links), e.g. docs/v2"""
    public = sys.argv[1] == '--public'
    out = Path(sys.argv[-1]); out.mkdir(parents=True, exist_ok=True)
    if public:
        LINKS.update(PUBLIC_LINKS)
    pages = {f'{key}.html': (lambda k=key: build(k)) for key in MACHINES}
    pages['index.html' if public else 'overview.html'] = build_index
    for name, make in pages.items():
        html = make()
        (out / name).write_text(public_page(html) if public else suite_page(html), encoding='utf-8')
        print('wrote', out / name)
    if not public:
        (out / 'index.html').write_text(SHELL, encoding='utf-8')
        print('wrote', out / 'index.html')


if __name__ == '__main__':
    main()
