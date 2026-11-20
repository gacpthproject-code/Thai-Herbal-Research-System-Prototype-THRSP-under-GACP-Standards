"""Repoint drifted error-code source pointers to the nearest line that names the code."""
import pathlib, re, sys
root = pathlib.Path(sys.argv[1]) / 'apps/backend'
catalog = root / 'shared/error-codes.js'
drifted = [a.split('@') for a in sys.argv[2:]]          # CODE@path:line
text = catalog.read_text()
for code, pointer in drifted:
    rel, old = pointer.rsplit(':', 1)
    lines = (root / rel).read_text().splitlines()
    hits = [i + 1 for i, l in enumerate(lines) if code in l]
    if not hits:
        raise SystemExit(f'{code}: not found in {rel}')
    new = min(hits, key=lambda n: abs(n - int(old)))
    old_src, new_src = f"source: '{rel}:{old}'", f"source: '{rel}:{new}'"
    block = re.search(r"\n  " + re.escape(code) + r": \{.*?\n  \},", text, re.S)
    if not block or old_src not in block.group(0):
        raise SystemExit(f'{code}: pointer {old_src} not in its catalog entry')
    text = text[:block.start()] + block.group(0).replace(old_src, new_src) + text[block.end():]
    print(f'{code}: {rel}:{old} -> :{new}')
catalog.write_text(text)
