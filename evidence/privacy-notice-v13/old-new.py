import difflib
import json
import sys


def load(path):
    return {s['viewport']: s for s in json.load(open(path, encoding='utf-8'))['seen']}


def print_changes(old_lines, new_lines):
    matcher = difflib.SequenceMatcher(a=old_lines, b=new_lines, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            continue
        old_items = ', '.join(str(i) for i in range(i1, i2)) or 'none'
        new_items = ', '.join(str(j) for j in range(j1, j2)) or 'none'
        print(f'[{tag}] old item {old_items} -> new item {new_items}')
        for line in old_lines[i1:i2]:
            print(f'- {line}')
        for line in new_lines[j1:j2]:
            print(f'+ {line}')


old_seen, new_seen = load(sys.argv[1]), load(sys.argv[2])
first, *others = new_seen
old, new = old_seen[first], new_seen[first]

print(f'viewport {first}')
print('\n== hero')
print_changes(old['effectiveDate'].split('\n'), new['effectiveDate'].split('\n'))
def section_number(text):
    return text.split('.', 1)[0]


old_by_number = {section_number(text): (selector, text) for selector, text in old['texts'].items()}
for selector, text in new['texts'].items():
    old_selector, old_text = old_by_number[section_number(text)]
    old_lines, new_lines = old_text.split('\n'), text.split('\n')
    print(f'\n== {selector} {new_lines[0]}' + ('' if old_selector == selector else f' (was {old_selector})'))
    if old_lines == new_lines:
        print('unchanged')
    else:
        print_changes(old_lines, new_lines)

for viewport in others:
    same = all(
        seen[viewport]['effectiveDate'] == seen[first]['effectiveDate']
        and seen[viewport]['texts'] == seen[first]['texts']
        for seen in (old_seen, new_seen)
    )
    print(f'\n{viewport}: {"same text as" if same else "TEXT DIFFERS from"} {first}, old and new')
