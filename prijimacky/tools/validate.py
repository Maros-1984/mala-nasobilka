"""Check <data>/tasks/<id>.json against <data>/crops/<id>/layout.json and SCHEMA.md.

Usage: python validate.py <data> [test-id ...]   (exit code 1 on any problem)
"""
import json
import re
import sys
from pathlib import Path

TYPES = {"choice", "yesno", "match", "number", "text", "set", "self"}
LETTERS = re.compile(r"^[A-H]$")


def part_max(part, task_points, single):
    t = part["type"]
    if t == "set":
        return max(part["table"].values())
    if t == "self":
        return part["points"]
    return part.get("points", task_points if single else None)


def check_part(p, where, errors):
    t = p.get("type")
    if t not in TYPES:
        errors.append(f"{where}: unknown type {t!r}")
        return
    if "id" not in p:
        errors.append(f"{where}: part without id")
    if t in ("choice", "match"):
        opts = p.get("options") or []
        if not opts or not all(LETTERS.match(o) for o in opts):
            errors.append(f"{where}: bad options {opts}")
        for a in [p.get("answer")] + p.get("accept", []):
            if a not in opts:
                errors.append(f"{where}: answer {a!r} not in options")
    elif t == "yesno":
        if p.get("answer") not in ("A", "N"):
            errors.append(f"{where}: yesno answer must be A or N")
    elif t == "number":
        for a in [p.get("answer")] + p.get("accept", []) + [x["answer"] for x in p.get("partial", [])]:
            if not isinstance(a, str) or not re.fullmatch(r"-?[\d ]+([.,]\d+)?", a):
                errors.append(f"{where}: number answer {a!r} is not plain digits")
    elif t == "text":
        if not isinstance(p.get("answer"), str) or not p["answer"].strip():
            errors.append(f"{where}: text answer missing")
    elif t == "set":
        if not isinstance(p.get("answer"), list) or not p["answer"]:
            errors.append(f"{where}: set answer must be a non-empty list")
        if p.get("kind") not in ("text", "number"):
            errors.append(f"{where}: set kind must be text or number")
        if not isinstance(p.get("table"), dict) or "0" not in p["table"]:
            errors.append(f"{where}: set table must map errors (from \"0\") to points")
    elif t == "self":
        if not isinstance(p.get("points"), int):
            errors.append(f"{where}: self part needs integer points")
        if not p.get("answer"):
            errors.append(f"{where}: self part needs a sample answer text")


def check_task(n, task, points, crops_dir, errors):
    where = f"task {n}"
    parts = task.get("parts") or []
    if not parts:
        errors.append(f"{where}: no parts")
        return
    for i, p in enumerate(parts):
        check_part(p, f"{where} part {i + 1}", errors)
    sc = task.get("scoring") or {}
    st = sc.get("type")
    if st == "sum":
        maxes = [part_max(p, points, len(parts) == 1) for p in parts]
        if None in maxes:
            errors.append(f"{where}: sum scoring but a part has no points")
            return
        total = sum(maxes)
    elif st == "count":
        table = sc.get("table") or {}
        total = max(table.values()) if table else 0
        if any(int(k) > len(parts) for k in table):
            errors.append(f"{where}: count table refers to more parts than exist")
    elif st == "all":
        total = sc.get("points")
    else:
        errors.append(f"{where}: unknown scoring {st!r}")
        return
    if total != points:
        errors.append(f"{where}: scoring max {total} != layout points {points}")
    ex = task.get("explanation") or {}
    if ex.get("source") not in ("cermat", "ai") or not (ex.get("md") or "").strip():
        errors.append(f"{where}: explanation missing or bad source")
    for c in task.get("keyCrops", []):
        if not (crops_dir / c).exists():
            errors.append(f"{where}: key crop {c} does not exist")


def validate(data, test_id):
    errors = []
    layout = json.loads((data / "crops" / test_id / "layout.json").read_text(encoding="utf-8"))
    path = data / "tasks" / f"{test_id}.json"
    if not path.exists():
        return [f"{test_id}: no task file"]
    doc = json.loads(path.read_text(encoding="utf-8"))
    tasks = doc.get("tasks", {})
    missing = set(layout["tasks"]) - set(tasks)
    extra = set(tasks) - set(layout["tasks"])
    if missing:
        errors.append(f"missing tasks {sorted(missing, key=int)}")
    if extra:
        errors.append(f"extra tasks {sorted(extra)}")
    for n, info in layout["tasks"].items():
        if n in tasks:
            check_task(n, tasks[n], info["points"], data / "crops" / test_id, errors)
    return [f"{test_id}: {e}" for e in errors]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    data = Path(sys.argv[1])
    ids = sys.argv[2:] or sorted(p.name for p in (data / "crops").iterdir() if p.is_dir())
    problems = []
    for test_id in ids:
        errs = validate(data, test_id)
        problems += errs
        print(f"{test_id}: {'OK' if not errs else f'{len(errs)} problems'}")
    for p in problems:
        print("  " + p)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
