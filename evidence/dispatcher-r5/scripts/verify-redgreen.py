"""Check every round-5 evidence item: its commits are on the branch (test before fix), its files exist,
each RED log shows a failing test and each GREEN log shows none. usage: verify-redgreen.py <index.json> <log dir> <worktree>"""
import json, os, re, subprocess, sys

index_path, log_dir, worktree = sys.argv[1:4]
index = json.load(open(index_path))

def git(*args):
    return subprocess.run(['git', '-C', worktree, *args], capture_output=True, text=True)

def counts(text):
    """(failed tests or suites, passed tests) from the last jest summary; a suite that fails to load counts as failed."""
    tests = re.findall(r'^Tests:\s+(.*)$', text, re.M)
    suites = re.findall(r'^Test Suites:\s+(.*)$', text, re.M)
    if not tests and not suites:
        return None
    line = tests[-1] if tests else ''
    failed = int(m.group(1)) if (m := re.search(r'(\d+) failed', line)) else 0
    passed = int(m.group(1)) if (m := re.search(r'(\d+) passed', line)) else 0
    if suites and (m := re.search(r'(\d+) failed', suites[-1])):
        failed = max(failed, int(m.group(1)))
    return failed, passed

def as_list(value):
    return value if isinstance(value, list) else ([value] if value else [])

problems = 0
for item in index['items']:
    notes = []
    for key in ('test', 'fix'):
        sha = item.get(key)
        if sha and git('merge-base', '--is-ancestor', sha, 'HEAD').returncode != 0:
            notes.append(f'{key} {sha} not on HEAD')
    if item.get('test') and item.get('fix') and item['test'] != item['fix']:
        if git('merge-base', '--is-ancestor', item['test'], item['fix']).returncode != 0:
            notes.append('test commit is not before the fix commit')
    for kind in ('red', 'green'):
        for name in as_list(item.get(kind)):
            path = os.path.join(log_dir, name)
            if not os.path.exists(path):
                notes.append(f'{kind} file missing: {name}')
                continue
            result = counts(open(path, encoding='utf8', errors='replace').read())
            if result is None:
                notes.append(f'{kind} {name}: no jest summary line')
            elif kind == 'red' and result[0] == 0:
                notes.append(f'red {name}: 0 failed')
            elif kind == 'green' and result[0] != 0:
                notes.append(f'green {name}: {result[0]} failed')
    status = 'ok' if not notes else 'CHECK'
    problems += bool(notes)
    print(f"{status:5} {item['item'][:70]} | " + ('; '.join(notes) if notes else 'commits on HEAD, red fails, green passes'))
print(f'{len(index["items"])} items, {problems} to check')
