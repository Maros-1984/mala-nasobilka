"""Download the CERMAT PDFs listed in manifest.json into <data>/pdf/.

Usage: python download.py <data-dir>
Existing files are skipped.
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent


def main():
    data = Path(sys.argv[1])
    out = data / "pdf"
    out.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))
    for t in manifest["tests"]:
        for kind in ("test", "key", "comment"):
            if kind not in t:
                continue
            target = out / f"{t['id']}_{kind}.pdf"
            if target.exists():
                continue
            url = manifest["base"] + t[kind]
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            if not body.startswith(b"%PDF"):
                raise SystemExit(f"not a PDF: {url}")
            target.write_bytes(body)
            print(f"{target.name}  {len(body) // 1024} kB")
            time.sleep(0.5)


if __name__ == "__main__":
    main()
