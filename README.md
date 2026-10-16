# Výnosnost těžebních strojů: S21 XP, Z15 Pro, L9

Statický web v `docs/` pro GitHub Pages (`main` / `docs`). Výpočty běží v prohlížeči.

| Stroj | Výkon / příkon | Těžba | Model výplaty |
|---|---|---|---|
| S21 XP | 270 TH/s / 3 645 W | BTC | BTC |
| Z15 Pro | 840 kSol/s / 2 780 W | ZEC | denní převod do BTC |
| L9 | 16,2 GH/s / 3 260 W | LTC + DOGE | denní převod do BTC |

## Peněžní toky a srovnání

Společný modul `src/economics.js` zajišťuje stejný harmonogram vkladů všech čtyř strategií:

- Den dodání: cena stroje + energie na 365 dní. Další platba energie vždy po 365 dnech, opět na celý rok dopředu.
- Energie = kW × 24 × 365 × plánovaný uptime × USD/kWh. Zadaná sazba je fixní v předplaceném roce; další roky používají stejnou sazbu. Odchylky skutečné spotřeby a jejich smluvní vyúčtování nejsou modelované.
- Těžba + držení: všechny výplaty zůstávají v BTC, energie se platí z vnějších vkladů.
- Těžba + prodej: výplaty se denně prodávají a hromadí v USD. Energie se financuje stejnými vnějšími vklady. Prodejní výnos tedy není podruhé použitý jako nový vklad.
- Spot: nákup BTC za počáteční vklad a za další vklady ve dnech ročních plateb energie. **Neinvestuje budoucí pětiletý rozpočet první den.**
- DCA: každý roční vklad se rozdělí do 53 nákupů v jeho dnech 0, 7, …, 364. V prvním roce se tak rozkládá cena stroje + první rok energie, v dalších letech jen roční platba energie. Nevyužitá hotovost se započítává do celkové hodnoty, bez úroku.
- Poslední necelý rok také vyžaduje celou roční platbu. Nevyčerpaná energie je zobrazena odděleně a nepředpokládá se její vrácení. Prodejní hodnota ASICu je 0; servis, daně ani obchodní poplatky nákupů BTC nejsou modelované.
- Výsledek = BTC × aktuální cena + hotovost − všechny vklady. ROI všech vkladů používá všechny dosavadní platby; samostatně je uveden poměr výsledku k ceně stroje. Není to anualizovaný výnos.
- Návratnost při držení je první překročení vložené částky tržní hodnotou BTC, nikoli realizovaný příjem ani trvalá návratnost. Obnovení roční energie může výsledek znovu snížit.

Při srovnání konečných hodnot mají všechny strategie totožné vklady. Kumulativní grafy energie ukazují **platby předem**, denní/měsíční provozní grafy ukazují spotřebu.

## Historie a scénáře

- `index.html`: souhrn tří strojů s výchozími parametry.
- `<stroj>.html`: historická simulace od zvoleného začátku plus scénáře.
- `<stroj>-faq.html`: pětiletá simulace stroje pořízeného k datu posledních dat.
- `<stroj>-nakup.html`: čistý historický backtest; každý den vstupu má vlastní těžbu i nákup se stejnými vklady, konec je vždy datum posledních pozorování. Žádné budoucí předpoklady neovlivňují historické skóre. Vstupy mají různé délky držení; podíl výher není pravděpodobností budoucího úspěchu. Používá se zadaná konstantní cena stroje a energie, nikoli archiv nabídek ASICů. Před skutečným dodáním stroje je simulace hypotetická.

BTC scénáře zůstávají +10 / +20 / +40 % ročně (CAGR). +10 % je pesimistická varianta modelu, nikoli dolní mez možného výsledku. Samostatný růst hashratu je na všech projekčních stránkách: BTC výchozích 30 %, ZEC 300 %, Scrypt 15 % ročně. Jsou to upravitelné předpoklady, nikoli tvrzení o historickém průměru. U ZEC/Scrypt je zvlášť citlivost hashratu na cenu mince (výchozí 0,3).

Halvingy jsou přibližná kalendářní data, skutečně závisí na výšce bloků. Projekce půlí pouze dotaci, zachovává transakční poplatky a normalizuje odměnu vůči datu posledních dat, takže už proběhlý halving neaplikuje podruhé. U ZEC je modelovaný podíl těžařů 80 % dotace; případná budoucí změna protokolu vyžaduje aktualizaci tohoto předpokladu.

## Měny

Všechny výpočty běží v USD: cena stroje, elektřina (USD/kWh) i ceny mincí. Koruny jsou jen přepočet pro zobrazení (souhrn a karty strojů) podle posledního kurzu ČNB uloženého v `data/derived/meta.json`, nikoli kurz v den jednotlivých plateb. Kurzové riziko plateb v CZK modelované není.

## Limity modelu

- Výkon sítě BTC v projekci roste zadaným tempem bez ohledu na cenu BTC (u ZEC a Scrypt sleduje cenu mince přes citlivost 0,3). V pesimistickém scénáři proto síť roste stejně rychle jako v optimistickém, ačkoli v reálu by část strojů při nízké hashprice vypnula; kapitulace minerů modelovaná není.
- Ceny se mění plynule o stálé roční procento (CAGR); cykly, propady a volatilita nejsou modelované. Scénáře nejsou předpověď ani pravděpodobnosti.
- Data budoucích halvingů jsou kalendářní odhad (rozestup 4 roky), skutečné datum určuje výška bloku.
- Transakční poplatky zůstávají na dnešní úrovni v BTC za blok, pokud varianta neuvádí jinak.
- Zbytková hodnota stroje je 0, výkon stroje v čase neklesá, poruchy a servis nejsou zahrnuté nad rámec uptime. Daně, poplatky burz a úroky z hotovosti nejsou modelované.
- Výtěžnost je model z dat celé sítě, ne výpis konkrétního poolu; skutečné výplaty se liší podle poolu a štěstí.

## Data a reprodukovatelnost

Zdrojem je [Coin Metrics Community API](https://community-api.coinmetrics.io/v4/timeseries/asset-metrics), metriky `PriceUSD`, `HashRate`, `IssTotNtv`, `FeeTotNtv` pro BTC, ZEC, LTC a DOGE, frekvence `1d`. Jednotky hashratu: BTC/LTC/DOGE TH/s, ZEC GSol/s. [Dokumentace metrik](https://docs.coinmetrics.io/network-data/network-data-overview/mining/hash-rate).

- `data/source/coinmetrics.json`: úplný zdrojový snímek včetně URL, času stažení a původních čísel. Obsahuje i chybějící úsek 24. 5. – 14. 10. 2026; dřívější interpolace jsou nahrazeny denními pozorováními API.
- `data/derived/*.json`: denní ceny UTC a zpětné sedmidenní průměry síťového hashratu a odměn. Hashrate je odhad sítě z blockchainu, nikoli přímo měřený součet strojů. Výtěžnost je model, nikoli přesná historická výplata poolu.
- Aktualizace zahrnuje jen uzavřené UTC dny do včerejška. Publikuje se po poslední den, který je kompletní pro všechny čtyři mince; neúplný den se doplní při dalším běhu. Zpoždění dat o více než 3 dny ukončí aktualizaci chybou. Mezery uvnitř historie aktualizaci také zastaví. Nic se neinterpoluje a staré hodnoty se nepřenášejí jako nová pozorování.
- `data/derived/meta.json`: stav dat a datovaný kurz ČNB; pokud kurz nelze obnovit, zůstane předchozí **s původním datem**.
- `data/manual/`: archiv původního ručního exportu, už není používán k výpočtu.
- `data/derived/harvest.json`: souhrn skutečných výsledků vykreslených stránek pro `index.html`.

## Sestavení a ověření

```bash
npm i --no-save playwright@1.64.0 chart.js@4.4.1
npx playwright install chromium
python3 scripts/update_live.py             # API: kompletní uzavřená historie
# nebo: python3 scripts/update_live.py --offline
node --test tests/economics.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/build_site.py --pages-only # první sestavení bez starého souhrnu
node scripts/harvest.js
python3 scripts/build_site.py
python3 scripts/build_v2.py --public docs/v2   # nové kalkulačky (úvod + S21 XP, Z15 Pro, L9)
node tests/browser.cjs                    # všechny stránky a změny parametrů
```

## Nové kalkulačky (docs/v2)

`scripts/build_v2.py` skládá pro každý stroj jednu stránku se záložkami (Přehled, Návratnost, Těžba vs. nákup, Otázky, Metodika) a panelem parametrů vlevo; k tomu úvod se srovnáním strojů. Výpočty jsou stejné jako na stránkách v `docs/` (hlavní stránka, FAQ a srovnání podle dne vstupu stroje běží beze změny, panel jim synchronizuje parametry). `python3 scripts/build_v2.py OUT_DIR` vytvoří totéž jako jeden artefakt claude.ai: `index.html` je obal, který zobrazuje `overview.html`, `s21.html`, `z15.html` a `l9.html` (soubory téhož artefaktu) v rámech. Přepínač strojů přepíná rámy bez načítání a předá záložku i pozici na stránce; na webu (`--public`) totéž dělá odkaz s `#záložka.karta.posun`.

**Monte Carlo a horská dráha** (jen kalkulačky, `src/mc.js` + adaptér stroje `src/mc_<stroj>.js`). Hladká projekce posouvá cenu každý den o stejné procento, takže neukáže propady ani to, kdy DCA pomůže. Proto se vybraný scénář přehraje 2 000×. Ke scénářové cestě se přidá kolísání z historických denních logaritmických výnosů (verzovaný snímek Coin Metrics od 25. 5. 2023). Výnosy jsou očištěné o průměr a losují se v 60denních kruhových blocích ze stejných dnů pro všechny měny stroje (BTC; BTC + ZEC; BTC + LTC + DOGE). Hashrate sítě reaguje na odchylku ceny od scénáře se zpožděním asi 90 dní: u BTC s citlivostí 0,5, u Zcash a Scrypt s citlivostí z panelu. Účetnictví je stejné jako v tabulce čtyř strategií. Při kolísání 0 % dá Monte Carlo přesně čísla deterministické projekce. Generátor má pevné semínko, výpočet běží po načtení stránky v dávkách (asi 0,3 s na M2). Výstupy:
- v záložce Těžba vs. nákup pravděpodobnosti, pásma 10.–90. percentilu, tabulka strategií s propady a „horská dráha“ jedné cesty den po dni;
- v záložce Návratnost podíl cest se zaplaceným strojem v čase;
- v Přehledu rozsah čisté hodnoty na konci odhadu.

Vzorek je kratší než celý cyklus, výsledky jsou proto rozsah možností, ne předpověď.

`CHROMIUM=/cesta/k/chromium` umožňuje použít vlastní prohlížeč. `scripts/rebuild_data.sh --offline` zopakuje kompletní sestavení z verzovaného snímku; bez přepínače obnoví data z API.

GitHub Action běží denně v 6:17 UTC, validuje data a výpočty, sestaví stránky, přepočítá souhrn a změny uloží. Staré generátory založené na neaktualizovaném CSV archivu byly nahrazeny společným aktualizátorem.
