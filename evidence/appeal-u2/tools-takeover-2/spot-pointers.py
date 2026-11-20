# usage: spot-pointers.py <repo> <markdown path in repo> <ref commit> <head commit>
# For each `path:line` (and a following `:line` in the same table cell) in the markdown, compare the line at
# <ref> with the line at <head>; report SAME, MOVED to the line now holding identical text, or CHANGED.
import re, subprocess, sys
repo, md, ref, head = sys.argv[1:5]
show = lambda rev, path: subprocess.run(['git', '-C', repo, 'show', f'{rev}:{path}'], capture_output=True, text=True).stdout.split('\n')
text = subprocess.run(['git', '-C', repo, 'show', f'{head}:{md}'], capture_output=True, text=True).stdout
pointers = []
for cell in text.split('|'):
    last = None
    for m in re.finditer(r'`((?:apps|scripts|docs)/[^`:]+)?:(\d+)`', cell):
        path = m.group(1) or last
        last = path
        if path:
            pointers.append((path, int(m.group(2))))
bad = 0
for path, n in dict.fromkeys(pointers):
    old, new = show(ref, path), show(head, path)
    was = old[n - 1].strip() if n <= len(old) else None
    now = new[n - 1].strip() if n <= len(new) else None
    if was is not None and was == now:
        continue
    hits = [i + 1 for i, line in enumerate(new) if was and line.strip() == was]
    bad += 1
    print(f'{"MOVED" if len(hits) == 1 else "CHANGED"} {path}:{n}' + (f' -> :{hits[0]}' if len(hits) == 1 else f' (identical text at {hits})') + f' :: {(was or "")[:90]}')
print(f'spot-pointers: {len(dict.fromkeys(pointers))} pointers, {bad} not on their line at {head[:9]}')
