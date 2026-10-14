#!/usr/bin/env python3
"""Assemble the pages from src/ parts and data/derived/ datasets.

    python3 scripts/build_site.py            # public website into docs/
    python3 scripts/build_site.py --artifact OUT_DIR
                                             # claude.ai artifact files (no <html>/<head> wrapper)
"""
import json, re, sys
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


def page_html(head, body, data, app):
    parts = [read(head + '.html'), read(body + '.html'), CHART]
    if data:
        parts.append('<script>const DATA=' + (DATA / f'{data}.json').read_text(encoding='utf-8').strip() + ';')
        parts.append(read(app + '.js') + '</script>')
    else:
        parts.append('<script>' + read(app + '.js') + '</script>')
    return '\n'.join(parts)


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
        (DOCS / out).write_text(public(out, page_html(head, body, data, app), label), encoding='utf-8')
        print('built', out)


if __name__ == '__main__':
    main()
