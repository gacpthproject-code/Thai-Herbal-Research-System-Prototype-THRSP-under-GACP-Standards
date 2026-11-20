import sys
path = sys.argv[1]
lines = open(path, encoding='utf-8').read().split('\n')
out, i, blocks = [], 0, 0
while i < len(lines):
    if lines[i].startswith('<<<<<<< '):
        j = lines.index('=======', i)
        k = next(n for n in range(j, len(lines)) if lines[n].startswith('>>>>>>> '))
        ours, theirs = lines[i+1:j], lines[j+1:k]
        while theirs and theirs[-1] == '':
            theirs.pop()
        out += theirs + [''] + ours
        blocks += 1
        i = k + 1
    else:
        out.append(lines[i]); i += 1
open(path, 'w', encoding='utf-8').write('\n'.join(out))
print(f'{path}: {blocks} block(s) resolved main-then-branch')
