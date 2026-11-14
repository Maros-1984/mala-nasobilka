"""Cut each task (and each shared source text) of a CERMAT test PDF into PNG crops.

Usage: python extract_crops.py <data-dir> [test-id ...]

Reads  <data>/pdf/<id>_test.pdf
Writes <data>/crops/<id>/*.png and <data>/crops/<id>/layout.json

A task starts at its points line ("max. 4 body", "1 bod") with the task number
just below it. A "VÝCHOZÍ TEXT … K ÚLOZE n" header belongs to task n; a header
for several tasks ("K ÚLOHÁM 1–3") becomes a shared group crop.
"""
import json
import re
import sys
from pathlib import Path

import pymupdf
from PIL import Image

ZOOM = 2.0
LEFT, RIGHT = 54, 562          # fixed horizontal window, same text scale in every crop
TOP, BOTTOM = 30, 806          # page body without the page-number footer
MAX_GAP_PX = 34                # longer white bands get collapsed to this height
LEFT_MARGIN_X = 85             # task numbers and headers start left of this

# Matched against text with all whitespace removed: some PDFs print "m ax. 2 bo d y".
POINTS_RE = re.compile(r"^(?:max\.)?(\d+)bod(?:y|ů)?$")
HEADER_RE = re.compile(r"^VÝCHOZÍ(?:TEXT|OBRÁZ)")
RANGE_RE = re.compile(r"KÚLOH(?:ÁM|AM|Y)?(\d+)(?:[–-](\d+))?|KÚLOH?ZE(\d+)")


def lines_of(page):
    """Yield (x0, y0, text, bold) per text line, spans joined."""
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            spans = [s for s in l["spans"] if s["text"].strip()]
            if not spans:
                continue
            text = " ".join(s["text"].replace(" ", " ").strip() for s in spans)
            bold = all(s["flags"] & 16 for s in spans)
            yield spans[0]["bbox"][0], spans[0]["bbox"][1], text, bold, spans


def find_markers(doc):
    markers = []  # (page, y, kind, data)
    for pno, page in enumerate(doc):
        lines = sorted(lines_of(page), key=lambda t: (t[1], t[0]))
        for x, y, text, bold, spans in lines:
            if not bold:
                continue
            compact = re.sub(r"\s+", "", text).upper()
            if compact.startswith("ZKONTROLUJTE"):
                markers.append((pno, y, "end", None))
            elif x > 400:
                m = POINTS_RE.match(compact.lower())
                if m:
                    markers.append((pno, y, "points", int(m.group(1))))
            elif x < LEFT_MARGIN_X:
                if HEADER_RE.match(compact):
                    markers.append((pno, y, "header", header_range(compact)))
                elif re.fullmatch(r"\d{1,2}", spans[0]["text"].strip()):
                    markers.append((pno, y, "number", int(spans[0]["text"].strip())))
    markers.sort(key=lambda m: (m[0], m[1]))
    return attach_numbers(markers)


def header_range(text):
    m = RANGE_RE.search(text)
    if not m:
        return None
    if m.group(3):
        a = b = int(m.group(3))
    else:
        a = int(m.group(1))
        b = int(m.group(2)) if m.group(2) else a
    return (a, b)


def attach_numbers(markers):
    """Turn points markers into task starts, using the number that follows."""
    out = []
    out_tasks = []
    for i, (pno, y, kind, data) in enumerate(markers):
        if kind == "points":
            nxt = next((m for m in markers[i + 1:i + 3]
                        if m[2] == "number" and m[0] == pno and 0 < m[1] - y < 32), None)
            if nxt is not None:
                n = nxt[3]
            else:
                # some tasks open straight with sub-part "6.1" and print no task number
                n = (out_tasks[-1] + 1) if out_tasks else 1
                print(f"  page {pno + 1} y={y:.0f}: no task number, assuming {n}")
            out_tasks.append(n)
            out.append((pno, y, "task", {"n": n, "points": data}))
        elif kind in ("header", "end"):
            out.append((pno, y, kind, data))
    return out


FOOTER_RE = re.compile(
    r"^\d{1,2}(\s*/\s*\d{1,2})?$|©|Centr\w* pro zjišťování|autorských práv|veřejně nepřístupná"
    r"|Obsah testového sešitu|obecně závazných|nepřímou podporu|přímou i nepřímou|komerční účely",
    re.IGNORECASE)


def blank_footer(page):
    """White out the page number and return where the page body ends.

    The last text line can reach as low as the page number, so the number is
    redacted instead of cutting above it.
    """
    h = page.rect.height
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            text = "".join(s["text"] for s in l["spans"]).strip()
            footer = FOOTER_RE.search(text)
            if l["bbox"][1] > h - 60 and footer:
                page.add_redact_annot(pymupdf.Rect(l["bbox"]) + (0, 3, 0, 0), fill=(1, 1, 1))  # top inset: never touch the line above
    page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE)
    return h - 12


def region_parts(start, end, npages, bottoms=None):
    """Split (page, y) -> (page, y) into per-page (page, y0, y1) slices."""
    (p0, y0), (p1, y1) = start, end
    parts = []
    for p in range(p0, min(p1, npages - 1) + 1):
        bottom = bottoms[p] if bottoms else BOTTOM
        a = y0 - 7 if p == p0 else TOP   # room for diacritics above capitals
        b = y1 - 7 if p == p1 else bottom
        if b - a > 8:
            parts.append((p, max(a, TOP), min(b, bottom)))
    return parts


def render(doc, parts, out_path, x0=LEFT, x1=RIGHT, color=False):
    images = []
    for p, y0, y1 in parts:
        clip = pymupdf.Rect(x0, y0, x1, y1)
        cs = pymupdf.csRGB if color else pymupdf.csGRAY
        pix = doc[p].get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM), clip=clip, colorspace=cs, alpha=False)
        img = Image.frombytes("RGB" if color else "L", (pix.width, pix.height), pix.samples)
        img = squeeze(img)
        if img is not None:
            images.append(img)
    if not images:
        return False
    width = max(i.width for i in images)
    gap = MAX_GAP_PX
    total = sum(i.height for i in images) + gap * (len(images) - 1)
    canvas = Image.new("RGB" if color else "L", (width, total), (255, 255, 255) if color else 255)
    y = 0
    for img in images:
        canvas.paste(img, (0, y))
        y += img.height + gap
    canvas.quantize(64 if color else 16).save(out_path, optimize=True)
    return True


def squeeze(img):
    """Trim white top/bottom and collapse long white bands."""
    w, h = img.size
    px = img.convert("L").load()
    ink = []
    for y in range(h):
        row_has_ink = False
        for x in range(0, w, 2):
            if px[x, y] < 200:
                row_has_ink = True
                break
        ink.append(row_has_ink)
    if not any(ink):
        return None
    first = ink.index(True)
    last = h - 1 - ink[::-1].index(True)
    keep = []
    run = 0
    for y in range(max(first - 6, 0), min(last + 7, h)):
        if ink[y]:
            run = 0
            keep.append(y)
        else:
            run += 1
            if run <= MAX_GAP_PX:
                keep.append(y)
    out = Image.new(img.mode, (w, len(keep)), (255, 255, 255) if img.mode == "RGB" else 255)
    for i, y in enumerate(keep):
        out.paste(img.crop((0, y, w, y + 1)), (0, i))
    return out


def process(data, test_id):
    doc = pymupdf.open(data / "pdf" / f"{test_id}_test.pdf")
    out = data / "crops" / test_id
    out.mkdir(parents=True, exist_ok=True)
    for f in out.glob("*.png"):
        if f.name[0] in "thg":   # keep k*.png key crops cut by crop_key.py
            f.unlink()
    if (data / "manual" / f"{test_id}.json").exists():
        return process_manual(data, test_id, doc, out)
    markers = find_markers(doc)
    bottoms = [blank_footer(p) for p in doc]
    end_of_doc = (len(doc) - 1, bottoms[-1] + 4)

    tasks, groups = {}, {}
    current = None
    pending_header = None   # single-task header waiting for its task
    for i, (pno, y, kind, data_) in enumerate(markers):
        if kind == "header" and current and data_ and data_[0] == current and data_[1] == current:
            continue  # sub-part header inside the current task (e.g. 7.1, 7.2)
        nxt = next_boundary(markers, i, current if kind == "task" else None)
        stop = (nxt[0], nxt[1]) if nxt else end_of_doc
        parts = region_parts((pno, y), stop, len(doc), bottoms)
        if kind == "task":
            n = data_["n"]
            current = n
            name = f"t{n}.png"
            crops = []
            if pending_header and pending_header[0] == n:
                crops.append(pending_header[1])
            pending_header = None
            if render(doc, parts, out / name):
                crops.append(name)
            tasks[n] = {"points": data_["points"], "crops": crops, "group": None}
        elif kind == "header":
            current = None
            if not data_:
                # unreadable range: assume the header belongs to the next task
                a = b = (max(tasks) + 1) if tasks else 1
                print(f"  page {pno + 1}: header without task range, assuming task {a}")
            else:
                a, b = data_
            if a == b:
                name = f"h{a}.png"
                render(doc, parts, out / name)
                pending_header = (a, name)
            else:
                gid = f"g{a}-{b}"
                render(doc, parts, out / f"{gid}.png")
                groups[gid] = {"tasks": list(range(a, b + 1)), "crops": [f"{gid}.png"]}
        else:
            current = None
    for gid, g in groups.items():
        for n in g["tasks"]:
            if n in tasks:
                tasks[n]["group"] = gid
    expected = list(range(1, max(tasks) + 1))
    if sorted(tasks) != expected:
        raise ValueError(f"{test_id}: tasks found {sorted(tasks)}")
    write_layout(test_id, out, tasks, groups)


def write_layout(test_id, out, tasks, groups):
    layout = {"tasks": {str(k): v for k, v in sorted(tasks.items())}, "groups": groups}
    (out / "layout.json").write_text(json.dumps(layout, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(t["points"] for t in tasks.values())
    print(f"{test_id}: {len(tasks)} tasks, {total} points, {len(groups)} groups")


def process_manual(data, test_id, doc, out):
    """Cut a test whose text layer is unusable from a hand-made region map.

    <data>/manual/<id>.json:
      {"tasks": {"1": {"points": 4, "regions": [[page, y0, y1], ...], "header": [[page, y0, y1]]}},
       "groups": {"g1-3": {"tasks": [1, 2, 3], "regions": [[page, y0, y1]]}}}
    Pages are 1-based, y in PDF points (see render_pages.py). "header" is optional.
    """
    spec = json.loads((data / "manual" / f"{test_id}.json").read_text(encoding="utf-8"))
    parts = lambda regions: [(p - 1, y0, y1) for p, y0, y1 in regions]
    tasks, groups = {}, {}
    for n, t in spec["tasks"].items():
        crops = []
        if t.get("header"):
            render(doc, parts(t["header"]), out / f"h{n}.png")
            crops.append(f"h{n}.png")
        if not render(doc, parts(t["regions"]), out / f"t{n}.png"):
            raise ValueError(f"{test_id}: task {n} region is empty")
        crops.append(f"t{n}.png")
        tasks[int(n)] = {"points": t["points"], "crops": crops, "group": None}
    for gid, g in spec.get("groups", {}).items():
        render(doc, parts(g["regions"]), out / f"{gid}.png")
        groups[gid] = {"tasks": g["tasks"], "crops": [f"{gid}.png"]}
        for n in g["tasks"]:
            tasks[n]["group"] = gid
    write_layout(test_id, out, tasks, groups)


def next_boundary(markers, i, current_task):
    for m in markers[i + 1:]:
        if m[2] == "header" and current_task and m[3] and m[3][0] == current_task == m[3][1]:
            continue
        return m
    return None


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    data = Path(sys.argv[1])
    ids = sys.argv[2:] or sorted(p.name[:-9] for p in (data / "pdf").glob("*_test.pdf"))
    for test_id in ids:
        process(data, test_id)


if __name__ == "__main__":
    main()
