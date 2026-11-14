# Přijímačky nanečisto – design

Practice app for the CERMAT entrance exam for 8-year gymnasiums (JPZ, osmiletá gymnázia),
Czech language and mathematics. It lives at `prijimacky/` next to the multiplication apps.
The UI is in Czech.

## Goal

An endless queue of real exam tasks. Before starting, the child filters the queue by subject,
task points (1–6) and a year range. Each task is shown as in the test, gets answered with native
controls, is evaluated with the official CERMAT partial-credit rules and then explained.

## Legal constraint → encrypted data

CZVV rules forbid re-publishing test booklets and keys without written consent. Personal use is fine.
The repository is public, so the content is committed **only encrypted** (AES-GCM, 256-bit key).
The key is in the URL fragment (`…/prijimacky/#k=<base64url>`), which browsers never send to the server.
The page stores the key in `localStorage` after the first visit. Plain-text sources (PDFs, crops,
task JSON) live outside the repo in a private data folder.

## Content pipeline (`prijimacky/tools/`, Python + PyMuPDF)

1. `manifest.json` lists every test with links to the test, key and commented solutions on CERMAT.
2. `download.py <data>` downloads the PDFs into `<data>/pdf/`.
3. `extract_crops.py <data>` cuts every task into a PNG (`<data>/crops/<id>/t<n>.png`) and every
   shared source text into a group crop (`g<a>-<b>.png`). A task starts at its points line
   ("max. 4 body"); single-task source texts (`h<n>.png`) are shown together with their task.
   Output also has `layout.json` with points per task. The checksum is that every test sums to 50 points.
4. The answer data (`<data>/tasks/<id>.json`, format in `tools/SCHEMA.md`) is transcribed from the key PDFs.
   Explanations come from the CERMAT commented solutions where they exist (`source: "cermat"`). Elsewhere
   they are written by AI and checked against the key (`source: "ai"`). The UI marks them as less trustworthy.
5. `validate.py <data>` checks the task JSON against the layout (all tasks present, max points match).
6. `build.py <data> <out>` encrypts one blob per test plus an index into `prijimacky/data/`.

## App (`prijimacky/`, vanilla ES modules, no build step)

- `index.html`, `style.css`
- `crypto.js` – key from the fragment/`localStorage`, AES-GCM decryption
- `grade.js` – pure evaluation of answers and points (unit-tested with `node --test`)
- `queue.js` – pure filtering and queue order (unit-tested)
- `app.js` – screens and rendering

Screens:

1. **Filter.** Subject ČJ/MA, points 1–6 and years from–to. Default: everything, years 2021–2026.
   Tests older than 2017 are labelled "starší formát".
2. **Task.** The source-text crop (if any), then the task crop and below it the inputs: choice buttons,
   ANO/NE pairs, matching selects, text and number fields, and self-assessment for constructions and
   open sentences. In landscape the source text sits on the left and the task on the right.
3. **Result.** Correct/wrong per part, points `x / y b.`, the key note, the CERMAT or AI explanation
   and a "Další úloha" button.

Queue rules: random order, no repeats until the filtered pool is used up, wrong tasks come back
later. Tasks sharing a source text are queued consecutively. Progress and stats are kept in
`localStorage` per device.

Display: pinch zoom stays enabled. There is a fullscreen button and A+/A− buttons for text size.
On a TV it is shown by mirroring the screen (AirPlay on iOS, Smart View on Android).

## Phases

1. Years 2025–2026, both subjects (16 tests) and the whole app.
2. Years 2021–2024.
3. Years 2015–2020, including the 2015 formula glyph fix.
