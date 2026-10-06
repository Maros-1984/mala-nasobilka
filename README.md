# Malá násobilka

Trénink malé násobilky (násobení i dělení 1–10) s měřením rychlosti odpovědi.
Dítě hraje na tabletu, rodič vidí ve statistikách, které příklady jdou zpaměti a které ne.

## Aplikace

Jeden společný kód, čtyři adresy (každá má vlastní profily a data v `localStorage`):

| Adresa | Co trénuje | Prahy zelená/oranžová | Kolo |
| --- | --- | --- | --- |
| `/` | malá násobilka a dělení 1–10 | 3 s / 5 s | 30 |
| `/velka/` | 2–9 × 11–99 (bez násobků 10), např. 7 × 45 | 6 s / 12 s | 20 |
| `/polovice/` | polovina sudých čísel do 200 a desítek do 1000 | 2 s / 4 s | 30 |
| `/deleni/` | obrácená velká násobilka, např. 315 : 7 | 10 s / 20 s | 15 |

Po chybě ukáže velká násobilka a dělení rozklad (`7 × 40 + 7 × 5 = 280 + 35 = 315`),
poloviny jen výsledek, a čeká na tlačítko Dál. Adaptivní výběr u velké násobilky
a dělení pracuje po skupinách (činitel × desítka), heatmapa ukazuje stejné skupiny.
Režimy definuje `modes.js`, markup stránky `shell.js`.

## Co to umí

- Kolo s nastavitelným počtem příkladů, numerická klávesnice na obrazovce (i fyzická).
- Měření času každé odpovědi. Správná odpověď se potvrdí sama, špatnou je třeba potvrdit tlačítkem OK, pak se ukáže správný výsledek a příklad se v kole zopakuje.
- Když dítě napíše nejdřív špatně a opraví se, zapíše se to jako správně s poznámkou "nejdřív N" (oranžová tečka v heatmapě).
- Krátký zvuk při správné i chybné odpovědi (syntetizovaný, bez souborů), globální vypínač v Nastavení.
- Adaptivní výběr: pomalé a chybové příklady chodí častěji, nehrané mají přednost.
- Statistiky: heatmapa 10×10 (medián posledních 5 pokusů, tečka = chyba), histogram časů, vývoj po kolech.
- Více profilů na jednom zařízení, data v `localStorage`, export/import JSON.

## Spuštění

Statická stránka, stačí otevřít `index.html` přes libovolný HTTP server
(ES moduly nefungují přes `file://`), například:

```
node tests/serve.js
```

a otevřít <http://localhost:4173>.

## Testy

End-to-end přes Playwright:

```
npm install
npx playwright install chromium
npm test
```

## Návrh

Spec: `docs/superpowers/specs/2026-09-19-mala-nasobilka-design.md`,
rozšíření o další aplikace: `docs/superpowers/specs/2026-10-06-dalsi-aplikace-design.md`
