# Task answer data – `<data>/tasks/<TEST_ID>.json`

One file per test. It holds everything the app needs except the images.

If a test PDF has no usable text layer (scans, broken font encodings), the crops come from a hand-made
region map `<data>/manual/<TEST_ID>.json` instead. See `process_manual` in `extract_crops.py` and use
`render_pages.py` to get page images with a y-ruler. The crops and points
come from `<data>/crops/<TEST_ID>/layout.json`, which is generated; never edit it.

```json
{
  "id": "C5A_2026",
  "tasks": {
    "1":  { "parts": [ {"id": "1", "type": "choice", "options": ["A","B","C","D"], "answer": "C"} ],
            "scoring": {"type": "sum"},
            "explanation": {"source": "cermat", "md": "…"} },
    "4":  { "parts": [ {"id": "4.1", "type": "yesno", "answer": "N"},
                       {"id": "4.2", "type": "yesno", "answer": "N"},
                       {"id": "4.3", "type": "yesno", "answer": "A"},
                       {"id": "4.4", "type": "yesno", "answer": "N"} ],
            "scoring": {"type": "count", "table": {"4": 2, "3": 1}},
            "explanation": {"source": "cermat", "md": "…"} }
  }
}
```

Every task number from `layout.json` must be present. Keys are task numbers as strings.

## Task fields

| field | meaning |
|---|---|
| `parts` | list of answer parts in the order they appear in the task (see below) |
| `scoring` | how parts turn into points (see below) |
| `keyNote` | optional. Short plain-text summary of the key's scoring notes worth showing after answering: tolerated answers, partial credit rules, what counts as an error. Czech, max ~400 chars. |
| `keyCrops` | optional. PNG names of crops cut from the key PDF (constructions: the solved drawing plus rubric), made with `crop_key.py`. |
| `explanation` | `{"source": "cermat" or "ai", "md": "..."}`. Mandatory. See Explanations. |

## Part types

Every part has `id` (shown label, e.g. `"4.1"`; for a single-part task use the task number) and `type`.
Optional `label` is a very short hint shown next to the input when the id alone is not clear
(e.g. `"První část"`, `"obsah šedého obrazce"`).

| type | extra fields | UI | correct when |
|---|---|---|---|
| `choice` | `options` (letters, e.g. `["A","B","C","D","E"]`), `answer` (letter), optional `accept` (other correct letters) | letter buttons | same letter as `answer` or one in `accept` |
| `yesno` | `answer`: `"A"` (ano / pravdivé) or `"N"` | ANO / NE buttons | same |
| `match` | `options` (letters), `answer` (letter) | letter buttons per part | same letter. Use it for matching tasks (one part per item) and for ordering tasks (one part per slot, `label` = slot name like "První část") |
| `number` | `answer` (string as in key, digits only, e.g. `"80000"`, `"4.5"`), optional `unit` (shown after the input, e.g. `"Kč"`, `"cm²"`, `"min"`), optional `accept` (other accepted strings), optional `partial`: `[{"answer": "50", "points": 1}]` | number field | numeric value equals `answer` or any `accept` (spaces ignored, `,` = `.`) |
| `text` | `answer` (string), optional `accept` (list), optional `partial` | text field | equal after trimming, collapsing spaces, lower-casing and dropping a final `.`. **Diacritics must match.** |
| `set` | `answer` (list of strings; an item may list alternatives separated by `|`, e.g. `"vydali|vydali se"`), `kind`: `"text"` or `"number"`, `table` (errors → points, e.g. `{"0": 4, "1": 3, "2": 2, "3": 1}`) | one field, items separated by commas | errors = expected items missing + given items not expected. Points from `table`, missing key = 0. Use for "vypište tři slova", "najděte 4 chybně zapsaná slova", "určete všechny částky" |
| `self` | `points` (max), `answer` (plain text sample answer, e.g. the key's model sentence or "viz řešení v klíči") | after reveal the child picks the points earned (0…max) | self-assessed. Use for constructions, drawing, "napište větu", and anything whose answer cannot be checked by string comparison |

## Scoring

| `scoring.type` | meaning |
|---|---|
| `"sum"` | every part has `points`; a correct part earns them (`partial` can earn less). `set` and `self` parts earn their own points. For a one-part 1-point task you may omit part `points` (defaults to the task points). |
| `"count"` | `table` maps number of correct parts → points (e.g. ANO/NE batteries `{"4":2,"3":1}`, matching `{"3":5,"2":3,"1":1}`). Missing key = 0. |
| `"all"` | `points`: earned only when all parts are correct (ordering tasks). |

The maximum points of the scoring must equal `points` of the task in `layout.json`.

## Explanations

`explanation.md` is a small Markdown subset: paragraphs separated by a blank line, `**bold**`,
`*italic*`, lines starting with `- ` for lists, and `x²`-style Unicode for powers. No HTML, no tables.

- Part ids must be unique within a task (answers are stored by id).
- `source: "cermat"`: the text of the CERMAT commented solution (Czech "komentovaná verze", maths "vzorové řešení" / "průvodce řešením") for this task, transcribed faithfully.
  Light cleanup is fine: join broken lines and drop page headers. Keep their wording.
- `source: "ai"`: your own explanation for a 11-year-old, in Czech: how to think about the task step by
  step and why the right answer is right (for choice tasks, also briefly why the tempting wrong options are
  wrong). Be concise, 3–10 short paragraphs or list items. Verify every number against the key. If the
  key and your reasoning disagree, the key wins. Then re-check, and mention the problem in your report.
