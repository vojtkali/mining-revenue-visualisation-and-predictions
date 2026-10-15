#!/usr/bin/env python3
"""Assemble the pages from src/ parts and data/derived/ datasets.

    python3 scripts/build_site.py            # public website into docs/
    python3 scripts/build_site.py --artifact OUT_DIR
                                             # claude.ai artifact files (no <html>/<head> wrapper)
"""
import datetime as dt, json, math, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC, DATA, DOCS = ROOT / 'src', ROOT / 'data' / 'derived', ROOT / 'docs'
CHART = '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>'

# out file, head, body, dataset (None = no embedded data), script, nav label
PAGES = [
    ('index.html',         'sumhead', 'sumbody', None,  'sumapp', 'Těžba v kostce'),
    ('s21xp.html',         'head',    'body',    'btc', 'app',    'S21 XP'),
    ('s21xp-faq.html',     'fhead',   'fbody',   'btc', 'fapp',   'S21 XP FAQ'),
    ('s21xp-nakup.html',   'lhead',   'lbody',   'btc', 'lapp',   'S21 XP vs. nákup'),
    ('z15pro.html',        'zhead',   'zbody',   'zec', 'zapp',   'Z15 Pro'),
    ('z15pro-faq.html',    'fzhead',  'fzbody',  'zec', 'fzapp',  'Z15 Pro FAQ'),
    ('z15pro-nakup.html',  'zlhead',  'zlbody',  'zec', 'zlapp',  'Z15 Pro vs. nákup'),
    ('l9.html',            'l9head',  'l9body',  'l9',  'l9app',  'L9'),
    ('l9-faq.html',        'l9fhead', 'l9fbody', 'l9',  'l9fapp', 'L9 FAQ'),
    ('l9-nakup.html',      'l9lhead', 'l9lbody', 'l9',  'l9lapp', 'L9 vs. nákup'),
]

# published claude.ai artifacts -> pages of the public site
ARTIFACT_LINKS = {
    'MJDtv4NGof9ypy3Ydg4cCx': 'index.html',
    'DiNVfn1d7mGmYRQYYaENSj': 's21xp.html',    'RtP8nzjRPr9e7Q89cg5jAj': 's21xp-faq.html',  '6KPbjesPeShPL8TjUcSekr': 's21xp-nakup.html',
    'Da2FmoaXTDHXKR36hHM7fN': 'z15pro.html',   '74FSLByEiRZa5nBhMBaYUr': 'z15pro-faq.html', '6qcYsFDWNQVQgeYCScfatd': 'z15pro-nakup.html',
    'EV6kP3pBeG4WnoPVSpGfAv': 'l9.html',       'KxU5277ukCrrYiWaKArC2G': 'l9-faq.html',     'U5PnzfysjR1pXZqD758Lj8': 'l9-nakup.html',
}

# wording written for the page owner, rephrased for a public audience
PUBLIC_TEXT = [
    ('Bod zvratu při vaší elektřině', 'Bod zvratu při zadané ceně elektřiny'),
    ('odečtené z vašeho grafu', 'odečtené z denního grafu ceny'),
    ('odečtená z vašeho grafu 2Miners', 'odečtená z grafu 2Miners'),
    ('z vašeho exportu z CoinMarketCap', 'z exportu CoinMarketCap'),
    ('vaše grafy a exporty a body z vyhledávání', 'grafy a exporty cen a body z vyhledávání'),
    (' Zpřesním, pokud dodáte exporty cen LTC a DOGE a hashrate Litecoinu za letošek.', ''),
]

PUBLIC_CSS = '''<style>
.site-nav{display:flex;flex-wrap:wrap;gap:6px 14px;padding-block:10px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));
  border-bottom:1px solid var(--line);background:var(--panel);font:500 13.5px var(--f-body)}
.site-nav a{color:var(--fg2);text-decoration:none}
.site-nav a[aria-current]{color:var(--fg);font-weight:600}
.site-nav a:hover,.site-nav a:focus-visible{color:var(--s1)}
.site-foot{max-width:1120px;margin:0 auto;padding-block:8px 40px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));
  color:var(--muted);font-size:12.5px}
</style>'''


def read(name):
    return (SRC / name).read_text(encoding='utf-8')


def fill(text, values, where):
    out = re.sub(r'\{\{([\w.]+)\}\}', lambda m: str(values[m.group(1)]), text)
    assert '{{' not in out, f'{where}: unfilled placeholder'
    return out


EMBED_DROP = ('source', 'observedAt')   # provenance stays in data/derived, the pages don't use it


def embedded_data(name):
    """Dataset for a page: per-row provenance dropped, floats to 6 significant digits
    (well below the precision of the inputs) - roughly halves the page size."""
    def r(x):
        return float(f'{x:.6g}') if isinstance(x, float) else x
    d = json.loads((DATA / f'{name}.json').read_text(encoding='utf-8'))
    d['rows'] = [{k: r(v) for k, v in row.items() if k not in EMBED_DROP} for row in d['rows']]
    return json.dumps(d, separators=(',', ':'), ensure_ascii=False)


def page_html(head, body, data, app):
    body_text = read(body + '.html')
    if data:
        panel = """<section class="card"><h2>Čtyři strategie při stejných vkladech</h2>
<p>Platba energie při dodání a každých 365 dní na celý rok předem. Zadaná cena za kWh je fixovaná v každém předplaceném roce; pro další roky model předpokládá stejnou sazbu. Rozpočet energie odpovídá zadanému příkonu a plánovanému uptime, bez modelovaného vyúčtování odchylek.</p>
<p>Spot nakupuje při ročních vkladech. DCA rozkládá každý roční vklad do 53 nákupů. Neinvestovaná hotovost zůstává bez úroku. U těžby + prodeje se výplaty hromadí v hotovosti; roční energii financují stejné vnější vklady jako u ostatních strategií.</p>
<div class="tbl"><table id="strategyTable"></table></div>
<p>Výsledek = BTC + hotovost − všechny vklady. Nevyčerpané předplatné energie je uvedeno zvlášť, bez předpokládaného vrácení. Hodnota použitého stroje je konzervativně 0; servis, daně a obchodní poplatky nákupů BTC zde nejsou započtené. ROI všech vkladů není anualizované. Sloupec vůči ceně stroje používá jiný jmenovatel.</p>
<p>„Návratnost při držení“ znamená první ocenění BTC nad všemi dosavadními platbami; nejde o realizovaný příjem ani záruku trvalé návratnosti. Další roční platba může výsledek opět snížit.</p></section>"""
        body_text = body_text.rsplit('</div>', 1)[0] + panel + '</div>'
    body_text += '<div class="site-foot">Data k {{LAST}}: uzavřené denní ceny UTC z Coin Metrics Community API. Hashrate a síťové odměny: zpětný sedmidenní průměr. Modelový výnos, nikoli výpis konkrétního poolu. <a href="https://github.com/vojtkali/mining-revenue-visualisation-and-predictions/blob/main/data/source/coinmetrics.json">Zdrojový snímek dat</a>.</div>'
    parts = [read(head + '.html'), '''<style>
.wrap{grid-template-columns:minmax(0,1fr)}
.wrap>*{min-width:0}
.qa .a,.notes,.lead,.site-foot{overflow-wrap:anywhere}
@media(max-width:520px){.n{white-space:normal}}
</style>''', body_text, CHART]
    if data:
        parts.append('<script>' + read('economics.js') + '</script>')
    if data:
        parts.append('<script>const DATA=' + embedded_data(data) + ';')
        parts.append(read(app + '.js') + '</script>')
    else:
        parts.append('<script>' + read(app + '.js') + '</script>')
    return '\n'.join(line.rstrip() for line in fill('\n'.join(parts), summary_values() if body == 'sumbody' else page_values(), body).splitlines())


# ---------- values derived from the datasets ----------
D = dt.date.fromisoformat


def cz_date(d):
    d = D(d) if isinstance(d, str) else d
    return f'{d.day}. {d.month}. {d.year}'


def meta():
    return json.loads((DATA / 'meta.json').read_text(encoding='utf-8'))


def page_values():
    rows = {k: json.loads((DATA / f'{k}.json').read_text(encoding='utf-8'))['rows'] for k in ('btc', 'zec', 'l9')}
    last = rows['btc'][-1]['d']
    assert all(r[-1]['d'] == last for r in rows.values()), 'datasets end on different days'
    return {
        'LAST': cz_date(last),
        'NEXT': cz_date(D(last) + dt.timedelta(1)),
        'DATA_MAX': (D(last) - dt.timedelta(1)).isoformat(),
        'P_BTC': round(rows['btc'][-1]['p']),
        'P_ZEC': round(rows['zec'][-1]['z']),
        'P_LTC': round(rows['l9'][-1]['l'], 2),
        'P_DOGE': round(rows['l9'][-1]['g'], 4),
        'LIVE_NOTE': '', 'LIVE_SENT': '', 'LIVE_SHORT': '',
    }


# ---------- summary page (index) from numbers harvested off the FAQ pages ----------
MONTHS = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']
MONTHS_GEN = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince']
# rows of each FAQ scenario table: worst, base, best
SCEN = {'s21': ('Pesimistický', 'Základní', 'Optimistický'), 'z15': ('Propad', 'Korekce', 'Růst'), 'l9': ('Propad', 'Základní', 'Růst')}


MINUS = '\u2212'


def num(s):
    s = s.replace('\u2212', '-').replace('\xa0', '').replace(' ', '').replace('$', '').replace('%', '').replace('BTC', '').replace(',', '.')
    return float(s)


def sep(n):
    return f'{n:,}'.replace(',', ' ')


def usd(x, sign=False):
    s = '$' + sep(abs(round(x)))
    return ('\u2212' if x < 0 else '+' if sign else '') + s


def sig3(x):
    return round(x, 2 - int(math.floor(math.log10(abs(x))))) if x else 0


def money_cell(usd_text, rate, step):
    czk = round(num(usd_text) * rate / step) * step
    return (f'<td><span class="money"><span class="usd">{usd_text}</span>'
            f'<span class="czk">{MINUS if czk < 0 else ""}{sep(abs(czk))} Kč</span></span></td>')


def parse_cz(s):
    m = re.fullmatch(r'(\d+)\. (\d+)\. (\d{4})', s.strip())
    return (int(m.group(3)), int(m.group(2))) if m else None


def month_year(s, none='do 5 let ne'):
    ym = parse_cz(s)
    return f'{MONTHS[ym[1] - 1]} {ym[0]}' if ym else none


def since(s):
    ym = parse_cz(s)
    return f'od {MONTHS_GEN[ym[1] - 1]} {ym[0]}' if ym else None


def pct_signed(x):
    x = round(x)
    return ('\u2212' if x < 0 else '+' if x > 0 else '') + f'{abs(x)} %'


def summary_values():
    h = json.loads((DATA / 'harvest.json').read_text(encoding='utf-8'))
    m = meta()
    rate = float(m['czk'])
    live = page_values()['LIVE_SHORT']
    out = {'LAST': page_values()['LAST'], 'today': h['s21']['v']['today'], 'rate': f'{rate:.2f}'.replace('.', ','), 'rateSrc': m['czkSource'],
           'liveShort': ',' + live.rstrip(',') if live else ''}
    chart, mine, lump, dca, sells = [], [], [], [], []
    for k in ('s21', 'z15', 'l9'):
        v, pay = h[k]['v'], h[k]['pay']
        head = [c.lower() for c in pay[0]]
        col = lambda name: next(i for i, c in enumerate(head) if c.startswith(name))
        row = lambda lbl: next(r for r in pay[1:] if r[0].startswith(lbl))
        worst, base, best = (row(l) for l in SCEN[k])
        c_val, c_hold, c_roi, c_loss = col('stack − zaplaceno'), col('zaplacení, držení'), col('roi'), col('první den ve ztrátě')
        val = lambda r: num(r[c_val])
        chart.append([round(val(worst)), round(val(base)), round(val(best))])
        net_day = num(v['netDay'])
        margin = num(v['beMargin'])
        coin = {'s21': 'BTC', 'z15': 'ZEC', 'l9': 'DOGE i LTC'}[k]
        if margin <= 0:
            margin_txt = 'už dnes ve ztrátě'
        elif k == 'l9':
            margin_txt = f'<span class="n">{v["beMargin"]}</span> (DOGE i LTC)'
        else:
            margin_txt = f'<span class="n">{v["beMargin"]}</span> ({coin} pod {usd(sig3(num(v["bePrice"])))})'
        loss_base, loss_worst = since(base[c_loss]), since(worst[c_loss])
        x = {
            'btcM': v['btcMonth'].replace(' BTC', ''), 'margin': margin_txt,
            'payBase': month_year(base[c_hold]), 'payBest': month_year(best[c_hold]), 'payWorst': month_year(worst[c_hold]),
            'cellBase': f'<td class="{"pos" if val(base) >= 0 else "neg"}"><span class="n">{usd(val(base), True)}</span></td>',
            'perBtc': usd(sig3(num(v['costPerBtc']))),
            'netDay': v['netDay'], 'netMonth': v['netMonth'], 'revMonth': v['revMonth'],
            'range': v['netMin'] + '–' + v['netMax'].replace('$', ''),
            'btc12': f"{num(v['btc12']):.3f}".replace('.', ',') + ' BTC', 'net12': v['net12'],
            'paySimple': v['paySimple'], 'roiY': v['roiY'], 'roi5': pct_signed(num(base[c_roi])),
            'hrGrowth': pct_signed(num(v['hrGrowth12'])),
            'drop10': pct_signed((num(v['netDn10']) / net_day - 1) * 100) if net_day > 0 else 've ztrátě už teď',
            'be': usd(sig3(num(v['bePrice']))) if k != 'l9' else '', 'beH': usd(sig3(num(v['bePriceH']))) if k != 'l9' else '',
            'worstLoss': f'{loss_worst} denně ve ztrátě' if loss_worst else 'do ztráty nespadne',
            'worstEnd': usd(sig3(val(worst)), True),
            'beat': f'{round(h[k]["lumpBeat"][0] / h[k]["lumpBeat"][1] * 100)} %',
        }
        if k == 'z15':
            x['worstPay'] = f'stroj se přesto zaplatí ({month_year(worst[c_hold])})' if parse_cz(worst[c_hold]) else 'stroj se do 5 let nezaplatí'
            x['worstLoss'] = f'{loss_worst} je ve ztrátě' if loss_worst else 'do ztráty nespadne'
        if k == 'l9':
            x['ltcHalf'] = v['ltcShareHalf']; x['dogeShare'] = v['dogeShare']
            x['worstLoss'] = f'ztráta {loss_worst}' if loss_worst else 'bez denní ztráty'
        if k == 's21':
            x['halvingTail'] = (f', takže v základním scénáři je stroj denně ve ztrátě {loss_base}' if loss_base
                                else ', v základním scénáři ale stroj do ztráty nespadne')
        if k == 'z15':
            x['halvingTail'] = f', v základním scénáři ztráta {loss_base}' if loss_base else ', rezerva zůstává'
        out.update({f'{k}.{a}': b for a, b in x.items()})
        out.setdefault('rowDay', ''); out['rowDay'] += money_cell(v['netDay'], rate, 1)
        out.setdefault('rowMonth', ''); out['rowMonth'] += money_cell(v['netMonth'], rate, 10)
        mine.append(num(v['valMine'])); lump.append(num(v['valLump'])); dca.append(num(v['valDca'])); sells.append(num(v['valSell']))
    cols = list(zip(mine, lump, dca, sells))
    for key, vals, i in (('rowMine', mine, 0), ('rowLump', lump, 1), ('rowDca', dca, 2), ('rowSell', sells, 3)):
        out[key] = ''.join(
            (f'<td><b><span class="n">{usd(x)}</span></b></td>' if x == max(cols[j])
             else f'<td><span class="n">{usd(x)}</span></td>') for j, x in enumerate(vals))
    names = ['S21 XP', 'Z15 Pro', 'L9']
    win = [names[j] for j, c in enumerate(cols) if max(c[0],c[3]) == max(c)]
    out['winners'] = ('Těžba nevyhrává u žádného stroje.' if not win else
                      f'Těžba vyhrává u {" a ".join(win)}.' if len(win) < 3 else 'Těžba vyhrává u všech tří strojů.')
    out['CHART'] = json.dumps(chart)
    return out


def public(out, html, label):
    html = re.sub(r'\s*<div class="verify">.*?</div>', '', html, flags=re.S)
    for a, b in PUBLIC_TEXT:
        html = html.replace(a, b)
    for art, page in ARTIFACT_LINKS.items():
        html = re.sub(r'https://claude\.ai/(code/)?artifact/' + art, page, html)
    assert 'claude.ai/artifact' not in html, f'{out}: unmapped artifact link'
    title = re.search(r'<title>.*?</title>', html).group(0)
    html = html.replace(title, '', 1)
    nav = '<nav class="site-nav" aria-label="Stránky">' + ''.join(
        f'<a href="{p}"{" aria-current=page" if p == out else ""}>{l}</a>' for p, *_, l in PAGES) + '</nav>'
    foot = ('<footer class="site-foot">Výpočty jsou modelové scénáře z veřejných dat sítí a nejsou investičním doporučením ani '
            'zárukou výnosu. Zdroj dat: Coin Metrics Community Data a další uvedené zdroje.</footer>')
    return ('<!doctype html><html lang="cs"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            f'{title}<style>:root{{color-scheme:light}}body{{margin:0;font:14px system-ui,-apple-system,"Segoe UI",sans-serif}}'
            'img{max-width:100%}[hidden]{display:none!important}</style></head><body>'
            f'{nav}{html}{PUBLIC_CSS}{foot}</body></html>\n')


def main():
    if len(sys.argv) == 3 and sys.argv[1] == '--artifact':
        out_dir = Path(sys.argv[2]); out_dir.mkdir(parents=True, exist_ok=True)
        for out, head, body, data, app, _ in PAGES:
            (out_dir / out).write_text(page_html(head, body, data, app), encoding='utf-8')
        return
    DOCS.mkdir(exist_ok=True)
    (DOCS / '.nojekyll').write_text('')
    for out, head, body, data, app, label in PAGES:
        if '--pages-only' in sys.argv and data is None:
            continue
        (DOCS / out).write_text(public(out, page_html(head, body, data, app), label), encoding='utf-8')
        print('built', out)


if __name__ == '__main__':
    main()
