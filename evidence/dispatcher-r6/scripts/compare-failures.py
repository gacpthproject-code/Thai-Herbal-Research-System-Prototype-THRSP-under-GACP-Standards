"""Compare the failed test names of a jest --json run with the baseline names ("● a › b" lines)."""
import json, re, sys
runs = [json.load(open(f)) for f in sys.argv[1].split(',')]
run = {'testResults': [r for x in runs for r in x['testResults']]}
for key in ['numFailedTests', 'numFailedTestSuites', 'numPendingTests', 'numTotalTests', 'numPassedTests', 'numTotalTestSuites']:
    run[key] = sum(x[key] for x in runs)
baseline = set()
for line in open(sys.argv[2]):
    line = line.strip()
    if line.startswith('●'):
        baseline.add(re.sub(r'\s+', ' ', line[1:].strip()))
failed = set()
for suite in run['testResults']:
    for t in suite.get('assertionResults', []):
        if t['status'] == 'failed':
            failed.add(re.sub(r'\s+', ' ', ' › '.join(t['ancestorTitles'] + [t['title']])))
    if suite.get('status') == 'failed' and not suite.get('assertionResults'):
        failed.add('SUITE ' + suite['name'].split('apps/backend/')[-1] + ' :: ' + (suite.get('message') or '')[:160].replace('\n', ' '))
new = sorted(failed - baseline)
gone = sorted(baseline - failed)
print(f"run: {run['numTotalTestSuites']} suites, {run['numTotalTests']} tests: {run['numPassedTests']} passed, {run['numFailedTests']} failed in {run['numFailedTestSuites']} suites, {run['numPendingTests']} skipped")
print(f"baseline names: {len(baseline)} · failed now: {len(failed)} · new: {len(new)} · baseline names now passing: {len(gone)}")
for n in new: print('NEW  ', n)
for n in gone: print('FIXED', n)
