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
- Do 23. 5. 2026 [Coin Metrics Community Data](https://github.com/coinmetrics/data); poté ceny BTC odečtené z denního grafu, ceny ZEC z exportu CoinMarketCap (`data/manual/`), hashrate Zcash z grafu 2Miners a pro LTC/DOGE body z veřejných zdrojů. Úseky po 23. 5. 2026 jsou na stránkách podbarvené jako odhad.

## Sestavení

```bash
scripts/rebuild_data.sh          # stáhne Coin Metrics, přepočítá data a sestaví docs/
python3 scripts/build_site.py    # jen sestaví docs/ z src/ a data/derived/
```

Výpočty jsou modelové scénáře, ne investiční doporučení ani záruka výnosu.
