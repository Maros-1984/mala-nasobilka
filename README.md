# Malá násobilka

Trénink malé násobilky (násobení i dělení 1–10) s měřením rychlosti odpovědi.
Dítě hraje na tabletu, rodič vidí ve statistikách, které příklady jdou zpaměti a které ne.

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

Spec: `docs/superpowers/specs/2026-09-19-mala-nasobilka-design.md`
