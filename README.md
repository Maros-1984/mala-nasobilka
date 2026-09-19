# Malá násobilka

Tréning malej násobilky (násobenie aj delenie 1–10) s meraním rýchlosti odpovede.
Dieťa hrá na tablete, rodič vidí v štatistikách, ktoré príklady idú spamäti a ktoré nie.

## Čo to vie

- Kolo s nastaviteľným počtom príkladov, numerická klávesnica na obrazovke (aj fyzická).
- Meranie času každej odpovede, pri chybe sa ukáže správny výsledok a príklad sa v kole zopakuje.
- Adaptívny výber: pomalé a chybové príklady chodia častejšie, nehrané majú prednosť.
- Štatistiky: heatmapa 10×10 (medián posledných 5 pokusov, bodka = chyba), histogram časov, vývoj po kolách.
- Viac profilov na jednom zariadení, dáta v `localStorage`, export/import JSON.

## Spustenie

Statická stránka, stačí otvoriť `index.html` cez ľubovoľný HTTP server
(ES moduly nefungujú cez `file://`), napríklad:

```
node tests/serve.js
```

a otvoriť <http://localhost:4173>.

## Testy

End-to-end cez Playwright:

```
npm install
npx playwright install chromium
npm test
```

## Návrh

Spec: `docs/superpowers/specs/2026-09-19-mala-nasobilka-design.md`
