"""把三个 package.json 的版本号改成 1.8.0（只改顶层 version）。"""
import json
import pathlib

for rel in ("package.json", "client/package.json", "server/package.json"):
    p = pathlib.Path(rel)
    text = p.read_text(encoding="utf-8")
    old = '"version": "0.1.0"'
    assert old in text, rel
    text = text.replace(old, '"version": "1.8.0"', 1)
    p.write_text(text, encoding="utf-8")
    data = json.loads(p.read_text(encoding="utf-8"))
    print(f"{rel}: {data.get('name')} → {data['version']}")
