"""Encrypt the task data into prijimacky/data/ for the app.

Usage: python build.py <data> [<out-dir>] [--from-year YYYY]
(out-dir defaults to ../data next to this script; --from-year leaves out older tests)

Takes every test whose task file passes validate.py. Writes:
  index.bin      {tests: [...], tasks: [{t, n, points, group}]}
  <test-id>.bin  {id, groups: {gid: [img]}, tasks: {n: {...task, crops: [img], keyCrops: [img]}}}
Images are embedded as data URLs. Each file is a 12-byte IV followed by the AES-256-GCM ciphertext.
The key lives in <data>/key.txt (created on first run) and never enters the repository.
"""
import base64
import hashlib
import hmac
import json
import secrets
import sys
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from validate import validate

HERE = Path(__file__).parent


def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def load_key(data):
    path = data / "key.txt"
    if not path.exists():
        path.write_text(b64url(secrets.token_bytes(32)), encoding="ascii")
        print(f"new key written to {path}")
    raw = path.read_text(encoding="ascii").strip()
    return raw, base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))


def img(path):
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode()


def encrypt(key, obj, out):
    body = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode()
    # IV derived from key + content: unchanged tests give byte-identical files (no git churn),
    # and different contents never share an IV.
    iv = hmac.new(key, body, hashlib.sha256).digest()[:12]
    out.write_bytes(iv + AESGCM(key).encrypt(iv, body, None))
    return len(body)


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    from_year = 0
    if "--from-year" in args:
        i = args.index("--from-year")
        from_year = int(args[i + 1])
        del args[i:i + 2]
    data = Path(args[0])
    out = Path(args[1]) if len(args) > 1 else HERE.parent / "data"
    out.mkdir(parents=True, exist_ok=True)
    key_text, key = load_key(data)
    manifest = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))

    index = {"tests": [], "tasks": []}
    for t in manifest["tests"]:
        tid = t["id"]
        if t["year"] < from_year:
            continue
        crops = data / "crops" / tid
        if not (data / "tasks" / f"{tid}.json").exists():
            print(f"{tid}: skipped, no task file")
            continue
        errors = validate(data, tid)
        if errors:
            print(f"{tid}: skipped, {len(errors)} validation problems")
            continue
        layout = json.loads((crops / "layout.json").read_text(encoding="utf-8"))
        answers = json.loads((data / "tasks" / f"{tid}.json").read_text(encoding="utf-8"))["tasks"]
        blob = {"id": tid, "groups": {}, "tasks": {}}
        for gid, g in layout["groups"].items():
            blob["groups"][gid] = [img(crops / c) for c in g["crops"]]
        for n, info in layout["tasks"].items():
            a = answers[n]
            blob["tasks"][n] = {
                **a,
                "points": info["points"],
                "group": info["group"],
                "crops": [img(crops / c) for c in info["crops"]],
                "keyCrops": [img(crops / c) for c in a.get("keyCrops", [])],
            }
            index["tasks"].append({"t": tid, "n": int(n), "points": info["points"], "group": info["group"]})
        size = encrypt(key, blob, out / f"{tid}.bin")
        src = {k: manifest["base"] + t[k] for k in ("test", "key", "comment") if k in t}
        index["tests"].append({"id": tid, "subject": t["subject"], "year": t["year"], "term": t["term"], "source": src})
        print(f"{tid}: {len(layout['tasks'])} tasks, {size // 1024} kB")
    encrypt(key, index, out / "index.bin")
    print(f"index: {len(index['tests'])} tests, {len(index['tasks'])} tasks")
    print(f"open with: …/prijimacky/#k={key_text}")


if __name__ == "__main__":
    main()
