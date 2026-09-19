# Malá násobilka Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Static tablet-first web page where a child drills multiplication/division 1–10 and a parent sees per-fact response-time heatmaps, histograms and progress.

**Architecture:** Four static files (`index.html`, `style.css`, `app.js`, `stats.js`), ES modules, no build. All state in one `localStorage` key, derived stats computed at render time. Playwright drives the real UI for tests.

**Tech Stack:** Vanilla HTML/CSS/JS (ES2022 modules), inline SVG charts, Playwright (`@playwright/test`) with a tiny static server, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-19-mala-nasobilka-design.md`

## Global Constraints

- Slovak UI text everywhere.
- Facts: `mul` a×b and `div` (a·b):a for a,b ∈ 1..10; `3×7` ≠ `7×3`.
- Storage key `nasobilka.v1`, schema exactly as in spec; per-fact stats are never persisted.
- Defaults: 30 questions/round, ops `both`, greenMs 3000, orangeMs 5000.
- No libraries at runtime. No auto-submit on digit count.
- Question element carries `data-op`, `data-a`, `data-b` for tests.

---

### Task 1: Scaffold + Playwright harness + profile screen

**Files:**
- Create: `package.json`, `playwright.config.js`, `tests/serve.js`, `tests/helpers.js`, `tests/profile.spec.js`
- Create: `index.html`, `style.css`, `app.js`, `stats.js` (empty exports), `.gitignore`

**Interfaces:**
- Produces: `app.js` exports nothing; `stats.js` exports `FACTS`, `factKey(op,a,b)`, `answerOf(op,a,b)`, `questionText(op,a,b)`.
- Produces: `tests/helpers.js` exports `createProfile(page, name)` which lands on Home.
- Storage module inside `app.js`: `loadState()`, `saveState(state)`, `defaultSettings()`.

- [ ] Step 1: `npm init -y`, `npm i -D @playwright/test`, `npx playwright install chromium`.
- [ ] Step 2: `tests/serve.js` = `node:http` static server on port 4173 serving repo root (mime for html/css/js/json). `playwright.config.js` uses `webServer: { command: 'node tests/serve.js', port: 4173 }`, viewport 820×1180, project chromium.
- [ ] Step 3: Failing test `profile.spec.js`: open `/`, expect heading "Kto hrá?", type name "Ema" into `#new-profile-name`, click "Pridať", expect button "Ema" visible, click it, expect `#home h1` text "Ema". Reload, expect Home again with "Ema" (active profile persisted).
- [ ] Step 4: Implement `index.html` with `<section id="screen-profiles">`, `<section id="screen-home">` etc. (all screens in DOM, `hidden` toggled by `showScreen(id)`), `app.js` with state load/save, profile add/select/delete (confirm dialog via `confirm()` is forbidden in tests → use inline "Naozaj?" button that appears for 3 s).
- [ ] Step 5: Run `npx playwright test tests/profile.spec.js`, expect pass. Commit `feat: scaffold, profiles, playwright harness`.

### Task 2: Round screen with numpad and timing

**Files:**
- Create: `tests/round.spec.js`
- Modify: `index.html`, `app.js`, `stats.js`, `style.css`

**Interfaces:**
- Consumes: `FACTS`, `answerOf`, `questionText` from `stats.js`.
- Produces in `stats.js`: `pickRound(profile, settings, rng=Math.random)` → array of `{op,a,b}` of length `settings.questionsPerRound`, weighted per spec, no two equal neighbours.
- Produces in `app.js`: round state machine `{queue, index, answers, shownAt}`; on OK records `{op,a,b,given,correct,ms}`; wrong → `.feedback` shows `Správne: 56` for 1500 ms then next; wrong fact appended once to queue.
- DOM: `#question` (`data-op/a/b`), `#answer-display`, `.numpad button[data-key]` keys `0-9`, `back`, `ok`; `#progress` text `n / total`; `#btn-abort`.

- [ ] Step 1: Failing test: create profile, Settings → set `#set-count` to 5, save, Štart. Loop 5×: read data attrs, compute answer, tap digits, tap OK. Expect `#screen-summary` visible with "5 odpovedí" and "0 chýb".
- [ ] Step 2: Failing test: answer first question wrong (type answer+1), expect `.feedback` contains "Správne:", then finish all; expect summary "6 odpovedí", "1 chyba"; expect the wrong fact appeared twice (collect data attrs).
- [ ] Step 3: Implement `pickRound` (weighted sampling without replacement; weights per spec formula using `recentAttempts(profile, key, 5)`), round UI, keyboard handler (digits, Backspace, Enter), timing with `performance.now()`, summary screen (median, errors, 3 slowest).
- [ ] Step 4: Tests pass. Commit `feat: round with numpad, adaptive picking, summary`.

### Task 3: Settings (count, ops, thresholds) + abort

**Files:**
- Modify: `index.html`, `app.js`, `tests/round.spec.js`

- [ ] Step 1: Failing test: set ops to "Delenie", play 3 questions, every `data-op` is `div` and question text contains ":". Abort mid-round after 1 answer → Home; stats later show 1 answer.
- [ ] Step 2: Implement settings form (`#set-count`, `#set-ops` select mul/div/both, `#set-green`, `#set-orange` in seconds), persist to `profile.settings`; abort saves partial round if `answers.length>0`.
- [ ] Step 3: Pass, commit `feat: settings and abort`.

### Task 4: Statistics – heatmap

**Files:**
- Create: `tests/stats.spec.js`
- Modify: `stats.js` (`factStats(profile, op, a, b, settings)` → `{median, errors, seen, attempts}`; `renderHeatmap(container, profile, op, settings)`), `app.js`, `index.html`, `style.css`

- [ ] Step 1: Failing test: play a 5-question round (all correct), open Štatistiky, tab Heatmapa: exactly 5 `.cell.seen` cells across mul+div toggles; play one wrong answer → that cell has `.cell.err`. Click a cell → `#fact-history` lists attempts.
- [ ] Step 2: Implement grid 10×10 with header row/col, cell classes `seen green|orange|red`, `err`, text median in s (1 decimal), click → history panel.
- [ ] Step 3: Pass, commit `feat: heatmap`.

### Task 5: Statistics – histogram + trend (SVG)

**Files:**
- Modify: `stats.js` (`histogramBins(answers)` → 21 bins of `{correct,wrong}`; `renderHistogram(svg, answers)`; `roundSeries(profile)` → `[{medianMs, errorRate, date}]`; `renderTrend(svg, series)`), `app.js`, `index.html`, `tests/stats.spec.js`

- [ ] Step 1: Failing test: after 2 rounds, tab Histogram has `svg rect.bar` count > 0, filter "Posledné kolo" changes the total count label; tab Vývoj has `svg circle.point` count == 2.
- [ ] Step 2: Implement with viewBox-based responsive SVG, axes, labels.
- [ ] Step 3: Pass, commit `feat: histogram and trend charts`.

### Task 6: Export / Import + error states + Pages

**Files:**
- Modify: `app.js`, `index.html`, `tests/stats.spec.js`, `README.md`

- [ ] Step 1: Failing test: export triggers download (Playwright `waitForEvent('download')`), read file; clear localStorage, reload, import file via `#import-file` → profile and rounds restored (heatmap shows same seen cells).
- [ ] Step 2: Implement export (Blob download `nasobilka-<name>-<date>.json`), import (validate `version===1`, replace profiles with same id, else append), version>1 notice, storage unavailable notice, invalid JSON notice.
- [ ] Step 3: Pass all tests. README (SK, short). Commit. Create GitHub repo via `gh repo create mala-nasobilka --public --source . --push`, enable Pages via `gh api -X POST repos/{owner}/mala-nasobilka/pages -f build_type=legacy -f source[branch]=main -f source[path]=/`.
