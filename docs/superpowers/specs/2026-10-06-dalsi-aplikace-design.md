# Ďalšie aplikácie: veľká násobilka, polovice, delenie

Dátum: 2026-10-06

## Cieľ

Tri nové trenažéry pre staršie dieťa (11 rokov) na samostatných URL, postavené
na rovnakom engine ako malá násobilka. Polovice musia ísť z hlavy rýchlo,
násobenie a delenie za pár sekúnd.

## Rozsah

| Mód | URL | Fakty | Prahy | Kolo |
| --- | --- | --- | --- | --- |
| `velka` | `/velka/` | `mul2`: a ∈ 2..9, b ∈ 11..99, b % 10 ≠ 0 (648) | 6 / 12 s | 20 |
| `deleni` | `/deleni/` | `div2`: `(a·b) : a = b`, rovnaké a, b (648) | 10 / 20 s | 15 |
| `polovice` | `/polovice/` | `half`: párne 2..200 a desiatky 210..1000 (180), `b = 2` | 2 / 4 s | 30 |

UI je česky, text príkladu pri poloviciach je „Polovina z 360 = ?“.

## Rozhodnutia

- **Jeden engine**: `modes.js` definuje módy (fakty, skupiny, mriežky
  heatmapy, nápovedu, defaulty), `shell.js` generuje markup. Každá URL je
  tenký `index.html` s `<body data-mode>`. Pôvodná appka beží na `/`
  bez zmeny URL, dát ani správania.
- **Oddelené dáta**: každý mód má vlastný `localStorage` kľúč
  (`nasobilka.v1`, `velka-nasobilka.v1`, `deleni.v1`, `poloviny.v1`), takže
  aj profily a prepínač zvuku sú pre každú appku zvlášť. Export nesie `mode`,
  import súbor z inej appky odmietne (export bez `mode` = malá násobilka).
- **Chyba**: v nových módoch sa ukáže nápoveda a čaká sa na „Dál“ (alebo
  OK / Enter), nie na časovač. Násobenie: `7 × 45 = 7 × 40 + 7 × 5 = 280 + 35 = 315`,
  delenie: `315 : 7 = 45, protože 7 × 40 + 7 × 5 = 280 + 35 = 315`,
  polovice: `Polovina z 74 je 37`.
- **Adaptivita**: pri `velka`/`deleni` sa váhy počítajú pre skupinu
  „činiteľ × desiatka“ (72 skupín, posledných 5 pokusov v skupine). Vylosuje
  sa skupina, v nej náhodný fakt, ktorý ešte v kole nebol. Pri polovice
  a malej násobilke je každý fakt vlastná skupina, teda pôvodné správanie.
- **Heatmapa**: `velka`/`deleni` mriežka 8×9 (riadok = činiteľ, stĺpec =
  desiatka), klik ukáže 9 faktov skupiny. Polovice: dve mriežky (do 200
  podľa desiatok × jednotiek, desiatky do 1000 podľa stoviek × desiatok).
- **Histogram**: rozsah `max(10 s, 2 × oranžová zaokrúhlené na 10 s)`,
  20 binov plus posledný „N+“.
- Prepínač medzi appkami: riadok odkazov na obrazovke profilov a domov.
