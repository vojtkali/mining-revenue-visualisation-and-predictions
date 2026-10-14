# Výnosnost těžebních strojů: S21 XP, Z15 Pro, L9

Statický web s grafy a odpověďmi na časté otázky o výnosu, návratnosti a rizicích tří ASIC strojů:

| Stroj | Algoritmus | Co těží | Výplata |
|---|---|---|---|
| Antminer S21 XP (270 TH/s, 3 645 W) | SHA-256 | Bitcoin | BTC |
| Antminer Z15 Pro (840 kSol/s, 2 780 W) | Equihash | Zcash | BTC (převod ZEC → BTC poolem) |
| Antminer L9 (16,2 GH/s, 3 260 W) | Scrypt | Dogecoin + Litecoin (merge mining) | BTC |

Web je ve složce [`docs/`](docs/) a je určený pro GitHub Pages (Settings → Pages → Deploy from a branch → `main` / `docs`).

## Stránky

- `index.html` – Těžba v kostce: stručné srovnání všech tří strojů
- `<stroj>.html` – historie od uvedení stroje na trh + projekce do zvoleného data (prodej vs. držení BTC, jednorázový nákup a DCA, scénáře)
- `<stroj>-faq.html` – odpovědi na časté otázky pro stroj koupený dnes, s grafy a nastavitelnými parametry
- `<stroj>-nakup.html` – těžba proti jednorázovému nákupu BTC v různé dny (načasování)

Všechny parametry (cena elektřiny, poplatek poolu, uptime, cena stroje, scénáře cen a růst sítě) jdou na stránkách změnit; výpočet běží v prohlížeči.

## Model

- Denní výnos = odměna sítě za den × výkon stroje ÷ výkon sítě × uptime × (1 − poplatek poolu), převedeno na BTC denním kurzem.
- Zcash: těžaři dostávají 80 % odměny (20 % jde do fondů do halvingu 2028). L9: součet výnosu z LTC a DOGE.
- Elektřina se platí v USD; vytěžené BTC se nikdy nekrátí o elektřinu („držení“ = hodnota stacku − zaplacená elektřina − cena stroje).
- Projekce: ceny se mění o zadané procento ročně, výkon sítě roste zadaným tempem (u Zcash a Scrypt navíc sleduje cenu mince), halvingy BTC 4/2028, LTC 7/2027, ZEC 11/2028. Stroj běží nepřetržitě.

## Data

- `data/derived/*.json` – denní datasety použité na stránkách (cena, hashrate sítě, odměny, hashvalue).
- Do 23. 5. 2026 [Coin Metrics Community Data](https://github.com/coinmetrics/data); poté ceny BTC odečtené z denního grafu, ceny ZEC z exportu CoinMarketCap (`data/manual/`), hashrate Zcash z grafu 2Miners a pro LTC/DOGE body z veřejných zdrojů. Úsek 24. 5. – 13. 10. 2026 je na stránkách podbarvený jako odhad.
- Od 14. 10. 2026 se data doplňují denně z veřejných API (`scripts/update_live.py`): ceny CoinGecko (záložně Coinbase, Blockchair), hashrate a odměny BTC z mempool.space, hashrate LTC z litecoinspace.org, ZEC a DOGE z Blockchair, kurz USD/CZK z ČNB (`data/derived/meta.json`).
- `data/derived/harvest.json` – čísla přečtená z vypočtených FAQ stránek (`scripts/harvest.js`), z nich se skládá souhrn `index.html`.

## Automatická aktualizace

GitHub Action `.github/workflows/update.yml` běží každý den v 6:17 UTC (a ručně přes *Run workflow*): stáhne aktuální data, sestaví stránky, přečte čísla pro souhrn, sestaví souhrn a změny commitne do `main`. GitHub Pages je pak zveřejní. Když chybí některá cena, běh skončí chybou a nic se nezapíše.

## Sestavení

```bash
python3 scripts/update_live.py   # doplní data do dneška z veřejných API
python3 scripts/build_site.py    # sestaví docs/ z src/ a data/derived/
npm i --no-save playwright@1.64.0 chart.js@4.4.1 && npx playwright install chromium
node scripts/harvest.js          # přečte čísla z FAQ stránek pro souhrn
python3 scripts/build_site.py    # znovu, aby souhrn použil nová čísla
scripts/rebuild_data.sh          # přepočet z Coin Metrics od začátku (data končí 13. 10. 2026,
                                 # denní řádky z API by se nahradily interpolací; spusťte pak update_live.py)
```

Výpočty jsou modelové scénáře, ne investiční doporučení ani záruka výnosu.
