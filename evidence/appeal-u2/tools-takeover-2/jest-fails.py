import json, sys
# usage: jest-fails.py <jest --json report> [backendRootPrefixToStrip] -> one "file :: full name" line per failed test, sorted
report = json.load(open(sys.argv[1]))
strip = sys.argv[2] if len(sys.argv) > 2 else ''
rows = set()
for suite in report.get('testResults', []):
    path = suite['name']
    rel = path.split('/apps/backend/', 1)[-1] if '/apps/backend/' in path else path.split('/apps/web-app/', 1)[-1]
    failed_tests = [a for a in suite.get('assertionResults', []) if a.get('status') == 'failed']
    for a in failed_tests:
        rows.add(f"{rel} :: {' › '.join(a.get('ancestorTitles', []) + [a.get('title', '')])}")
    if suite.get('status') == 'failed' and not failed_tests:
        rows.add(f"{rel} :: <suite failed to run> {suite.get('message', '')[:160]!r}")
for r in sorted(rows):
    print(r)
