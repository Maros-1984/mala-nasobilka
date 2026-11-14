"""Crop a region of a key (or commented-solution) PDF into the test's crop folder.

Find where text sits:
    python crop_key.py <data> <test-id> find "7.1" [--pdf key|comment]
    -> prints page number (1-based) and y of every hit

Cut a crop (pages 1-based, y in PDF points; a range may span pages):
    python crop_key.py <data> <test-id> cut <name> <page0> <y0> <page1> <y1> [--pdf key|comment]
    -> writes <data>/crops/<test-id>/<name>.png (use names like k7_1)
"""
import sys
from pathlib import Path

import pymupdf

from extract_crops import render, region_parts


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    kind = "key"
    if "--pdf" in args:
        i = args.index("--pdf")
        kind = args[i + 1]
        del args[i:i + 2]
    data, test_id, cmd = Path(args[0]), args[1], args[2]
    doc = pymupdf.open(data / "pdf" / f"{test_id}_{kind}.pdf")
    if cmd == "find":
        for pno, page in enumerate(doc):
            for r in page.search_for(args[3]):
                print(f"page {pno + 1}  y={r.y0:.0f}  x={r.x0:.0f}")
    elif cmd == "cut":
        name, p0, y0, p1, y1 = args[3], int(args[4]), float(args[5]), int(args[6]), float(args[7])
        parts = region_parts((p0 - 1, y0), (p1 - 1, y1), len(doc))
        out = data / "crops" / test_id / f"{name}.png"
        if not render(doc, parts, out, x0=30, x1=566):
            raise SystemExit("empty region")
        print(out)
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
