# Malá násobilka – trénovacia hra s meraním rýchlosti

Dátum: 2026-09-19

## Cieľ

Statická webová stránka (GitHub Pages), na ktorej dieťa trénuje malú násobilku
(násobenie aj delenie, 1–10) na tablete a rodič vidí, ktoré fakty ovláda
spamäti (rýchlo a bez chýb) a ktoré nie.

## Rozsah

- 100 faktov násobenia `a × b`, a,b ∈ 1..10; `3×7` a `7×3` sú samostatné fakty.
- 100 faktov delenia `(a·b) : a = b`, indexované rovnako (a = deliteľ, b = podiel).
- Slovenské UI, tablet-first (veľké tlačidlá), funguje aj na PC s klávesnicou.
- Viac profilov (deti) na jednom zariadení.
- Dáta iba v `localStorage`; export/import JSON.

## Technika

- Súbory: `index.html`, `style.css`, `app.js` (obrazovky, kolo, úložisko),
  `stats.js` (výber faktov, výpočty, SVG grafy). ES moduly, žiadny build,
  žiadne knižnice.
- Hosting: GitHub repo `mala-nasobilka`, Pages z vetvy `main`, koreň repa.
- Testy: Playwright end-to-end proti `index.html` (cez `file://` alebo
  jednoduchý statický server v testoch).

## Dátový model (`localStorage["nasobilka.v1"]`)

```json
{
  "version": 1,
  "activeProfileId": "p1",
  "profiles": [{
    "id": "p1", "name": "Ema", "createdAt": 1758290000000,
    "settings": { "questionsPerRound": 30, "ops": "both",
                  "greenMs": 3000, "orangeMs": 5000 },
    "rounds": [{
      "id": "r1", "startedAt": 1758290000000, "finishedAt": 1758290200000,
      "answers": [
        { "op": "mul", "a": 7, "b": 8, "given": 56, "correct": true, "ms": 2140 }
      ]
    }]
  }]
}
```

- `op` ∈ `mul` | `div`. Pre `div` je zobrazený príklad `(a·b) : a` a správna
  odpoveď `b`.
- Štatistiky per fakt sa nedržia, odvodzujú sa z `answers` pri renderi.
- Opakovaný (re-queued) pokus po chybe je bežný ďalší záznam v `answers`.

## Obrazovky

1. **Profily** – zoznam mien, tlačidlo Pridať, dlhé podržanie / ikona Zmazať
   (s potvrdením). Výber profilu → Domov.
2. **Domov** – meno, tlačidlá Štart kola, Štatistiky, Nastavenia, Zmeniť profil.
3. **Nastavenia** – počet príkladov v kole (10–100, default 30), operácie
   (násobenie / delenie / oboje), prahy zelená (default 3 s) a oranžová
   (default 5 s), Export JSON (stiahne súbor), Import JSON (nahradí profil
   alebo pridá profily s rovnakým id – nahradí), Zmazať všetky dáta profilu.
4. **Kolo** – hore postup `12 / 30`, veľký príklad `7 × 8 = ?` alebo
   `56 : 7 = ?`, pod ním zadaná odpoveď, numpad 0–9, ⌫, OK. Klávesnica PC:
   číslice, Backspace, Enter. OK bez zadanej hodnoty nič nerobí.
   - Čas = `performance.now()` od vykreslenia príkladu po OK.
   - Správne: krátky zelený flash, ďalší príklad.
   - Chyba: červený flash, 1,5 s zobrazená správna odpoveď, príklad sa pridá
     na koniec fronty kola (raz). Kolo má teda `questionsPerRound + počet chýb`
     odpovedí; postup ukazuje aktuálnu dĺžku fronty.
   - Tlačidlo Prerušiť: kolo sa uloží s doteraz zodpovedanými príkladmi, ak
     je aspoň 1 odpoveď.
5. **Súhrn kola** – medián času, počet chýb, 3 najpomalšie príklady kola,
   tlačidlá Ešte raz, Štatistiky, Domov.
6. **Štatistiky** – tri záložky:
   - **Heatmapa**: prepínač Násobenie / Delenie; mriežka 10×10, riadok = a,
     stĺpec = b. Farba bunky podľa mediánu posledných 5 pokusov: zelená
     `< greenMs`, oranžová `< orangeMs`, červená inak, sivá = bez pokusu.
     Malá bodka v rohu, ak je v posledných 5 pokusoch chyba. Text v bunke:
     medián v sekundách na 1 desatinné miesto. Klik → panel s históriou
     pokusov faktu (dátum, čas, správne/chyba).
   - **Histogram**: časy odpovedí, biny po 0,5 s do 10 s, posledný bin
     „10 s+“. Správne a chybné odpovede farebne oddelené (stacked). Filter
     Posledné kolo / Všetko.
   - **Vývoj**: po kolách, čiara mediánu času (s) a stĺpce chybovosti (%).
     Os x = poradie kola, tooltip / popisok s dátumom.
   Grafy sú inline SVG generované v JS, responzívne na šírku.

## Výber príkladov (adaptívny)

Pre každý fakt v povolených operáciách:

```
recent   = posledných 5 pokusov faktu
seen     = recent.length > 0
median   = medián ms z recent (ak seen)
errors   = počet chýb v recent
weight   = !seen ? 8
         : 1 + clamp((median - greenMs) / greenMs, 0, 3) + 2 * errors
```

Kolo losuje `questionsPerRound` faktov bez opakovania vážene (weighted
sampling without replacement). Ak je faktov menej než požadovaný počet
(napr. iba násobenie a 100+ otázok), losuje sa s opakovaním po vyčerpaní.
Poradie v kole sa premieša tak, aby dva po sebe idúce príklady neboli
rovnaké.

## Chybové stavy

- `localStorage` nedostupný/plný → oznam „Dáta sa nedajú uložiť“, hra beží
  v pamäti.
- Import neplatného JSON → oznam, nič sa nemení.
- Verzia dát vyššia než známa → oznam, dáta sa nenačítajú ani neprepíšu.

## Testy (Playwright, `tests/`)

Scenáre cez reálne UI na tablete-podobnom viewporte:

1. Vytvorenie profilu, nastavenie 5 príkladov, odohranie kola cez numpad,
   súhrn ukazuje 5 odpovedí a 0 chýb; heatmapa má 5 zafarbených buniek.
2. Chybná odpoveď: správna odpoveď sa zobrazí, príklad sa objaví znova,
   súhrn ukazuje 1 chybu, bunka má bodku chyby.
3. Histogram a vývoj sa vykreslia po 2 kolách (SVG má prvky).
4. Export → Import do čistého úložiska obnoví profil a jeho kolá.
5. Reload stránky zachová profil a štatistiky.

Test číta správnu odpoveď z DOM (data-atribúty `data-a`, `data-b`, `data-op`
na prvku príkladu), nič iné testovacie do UI nepridávame.
