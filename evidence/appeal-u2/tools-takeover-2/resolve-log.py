import pathlib, re, sys
p = pathlib.Path(sys.argv[1])
text = p.read_text()
pattern = re.compile(r'<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n', re.S)
blocks = pattern.findall(text)
assert len(blocks) == 1, f'expected one conflict, found {len(blocks)}'
ours, theirs = blocks[0]
merged = theirs.rstrip('\n') + '\n\n' + ours
text = pattern.sub(lambda m: merged, text, count=1)
assert '<<<<<<<' not in text and '>>>>>>>' not in text and '\n=======\n' not in text
p.write_text(text)
print(f'resolved: main block {theirs.count(chr(10))} lines first, branch block {ours.count(chr(10))} lines after')
