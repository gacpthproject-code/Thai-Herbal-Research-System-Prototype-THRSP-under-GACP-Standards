"""Delete the mock lines that stub validators the product no longer has (#47)."""
import pathlib, re, sys
root = pathlib.Path(sys.argv[1])
patterns = [
    re.compile(r"^\s*validateAllSteps: jest\.fn\(\(\) => \(\{ isValid: true, errorsByStep: \{\} \}\)\),\n", re.M),
    re.compile(r"^\s*validateMasterSubmission: jest\.fn\(\(\) => \(\{ isValid: true, missingByStep: \{\} \}\)\),\n", re.M),
]
total = 0
for path in sorted(root.rglob('*.test.js')):
    text = path.read_text()
    new = text
    for pat in patterns:
        new = pat.sub('', new)
    if new != text:
        removed = text.count('\n') - new.count('\n')
        total += removed
        path.write_text(new)
        print(f'{removed} {path.relative_to(root)}')
print('total lines removed:', total)
