"""Render PDF pages with a y-ruler, for writing a manual region map (see extract_crops.py).

Usage: python render_pages.py <data> <test-id> [test|key|comment]
Writes <data>/pages/<test-id>_<kind>_p<N>.png (N 1-based). Grid lines every 25 pt, labelled every 50 pt.
"""
import sys
from pathlib import Path

import pymupdf


def main():
    data, test_id = Path(sys.argv[1]), sys.argv[2]
    kind = sys.argv[3] if len(sys.argv) > 3 else "test"
    out = data / "pages"
    out.mkdir(exist_ok=True)
    doc = pymupdf.open(data / "pdf" / f"{test_id}_{kind}.pdf")
    for pno, page in enumerate(doc):
        w, h = page.rect.width, page.rect.height
        shape = page.new_shape()
        for y in range(0, int(h), 25):
            shape.draw_line((0, y), (w, y))
        shape.finish(color=(1, 0, 0), width=0.3, dashes="[2] 2")
        shape.commit(overlay=True)
        for y in range(50, int(h), 50):
            page.insert_text((2, y - 1), str(y), fontsize=7, color=(1, 0, 0), overlay=True)
            page.insert_text((w - 18, y - 1), str(y), fontsize=7, color=(1, 0, 0), overlay=True)
        path = out / f"{test_id}_{kind}_p{pno + 1}.png"
        page.get_pixmap(matrix=pymupdf.Matrix(1.6, 1.6)).save(path)
        print(path)


if __name__ == "__main__":
    main()
