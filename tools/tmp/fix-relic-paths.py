"""把遗物素材搬家后的路径引用改掉（只改字符串，不动逻辑）。"""
import pathlib

SUBS = {
    "scripts/tests/crypt-ui.mjs": [
        ("encodeURI('/Image/Crypt/遗物_正面.png')", "encodeURI('/Image/UI/遗物_正面.png')"),
        ("encodeURI('/Image/Crypt/遗物_背面.png')", "encodeURI('/Image/UI/遗物_背面.png')"),
        ("encodeURI('/Image/Crypt/遗物_牌背.png')", "encodeURI('/Image/Relic/牌背.png')"),
    ],
    "scripts/tests/build-crypt-assets.mjs": [
        ("mkdirSync('Image/Crypt', { recursive: true });",
         "mkdirSync('Image/UI', { recursive: true });\nmkdirSync('Image/Relic', { recursive: true });"),
        ("'Image/Crypt/遗物_正面.png'", "'Image/UI/遗物_正面.png'"),
        ("'Image/Crypt/遗物_背面.png'", "'Image/UI/遗物_背面.png'"),
        ("'Image/Crypt/遗物_牌背.png'", "'Image/Relic/牌背.png'"),
        ("`Image/Crypt/遗物_正面.png  460×660", "`Image/UI/遗物_正面.png  460×660"),
        ("`Image/Crypt/遗物_背面.png  460×660", "`Image/UI/遗物_背面.png  460×660"),
        ("`Image/Crypt/遗物_牌背.png  460×660", "`Image/Relic/牌背.png  460×660"),
        ("Image/UI/坍塌板块.png`、`Image/Crypt/*.png`",
         "Image/UI/坍塌板块.png`、`Image/UI/遗物_*.png`、`Image/Relic/牌背.png`"),
    ],
}

for path, pairs in SUBS.items():
    p = pathlib.Path(path)
    text = p.read_text(encoding="utf-8")
    for a, b in pairs:
        if a not in text:
            print(f"MISS {path}: {a[:60]}")
        text = text.replace(a, b)
    p.write_text(text, encoding="utf-8")
    print(f"ok {path}")

# 残留检查
for path in list(SUBS) + ["content/maps/crypt.json", "client/src/uiAssets.ts"]:
    for i, line in enumerate(pathlib.Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if "Image/Crypt" in line:
            print(f"残留 {path}:{i}: {line.strip()}")
print("done")
