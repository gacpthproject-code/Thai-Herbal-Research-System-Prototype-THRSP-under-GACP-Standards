# usage: summarize.py <raw dir> <baseline-names> <baseline-suites>  -> prints the evidence summary of the batch
import json, os, pathlib, sys

raw, base_names_path, base_suites_path = (pathlib.Path(p) for p in sys.argv[1:4])
base_names = set(base_names_path.read_text().split('\n')) - {''}
base_suites = set(base_suites_path.read_text().split('\n')) - {''}


def rel(path):
    for root in ('/apps/backend/', '/apps/web-app/'):
        if root in path:
            return path.split(root, 1)[1]
    return path


def failures(report):
    rows = set()
    for suite in report.get('testResults', []):
        failed = [a for a in suite.get('assertionResults', []) if a.get('status') == 'failed']
        for a in failed:
            rows.add(f"{rel(suite['name'])} :: {' › '.join(a.get('ancestorTitles', []) + [a.get('title', '')])}")
        if suite.get('status') == 'failed' and not failed:
            rows.add(f"{rel(suite['name'])} :: <suite failed to run>")
    return rows


def counts(report):
    return (f"suites {report['numPassedTestSuites']} passed, {report['numFailedTestSuites']} failed, "
            f"{report['numPendingTestSuites']} skipped, {report['numTotalTestSuites']} total · tests "
            f"{report['numPassedTests']} passed, {report['numFailedTests']} failed, {report['numPendingTests']} skipped, "
            f"{report['numTotalTests']} total")


def first_failure_line(report, name):
    suite_path, _, title = name.partition(' :: ')
    for suite in report.get('testResults', []):
        if rel(suite['name']) != suite_path:
            continue
        for a in suite.get('assertionResults', []):
            if ' › '.join(a.get('ancestorTitles', []) + [a.get('title', '')]) == title and a.get('failureMessages'):
                for line in a['failureMessages'][0].split('\n'):
                    line = line.strip()
                    if line and not line.startswith('at '):
                        return line[:150]
        return (suite.get('message') or '').strip().split('\n')[0][:150]
    return ''


full = json.loads((raw / 'full.json').read_text())
fails = failures(full)
new = sorted(fails - base_names)
gone = sorted(base_names - fails)
print('## backend full suite at the merged head (one process, maxWorkers 1 from jest.config.cjs, 4 GB heap like run-gate.sh)')
print(counts(full))
print(f'failing test names: {len(fails)} · in main\'s baseline (8 names at 18c6e9ac9): {len(fails & base_names)} · outside it: {len(new)}')
failed_suites = sorted({n.split(' :: ')[0] for n in fails})
print(f'failing suites: {len(failed_suites)} · in fails-18c6e9ac: {len(set(failed_suites) & base_suites)}')
print()
print('### baseline names that did not fail here')
for n in gone:
    print(f'- {n}')
print()
print('### failing names outside the baseline, with the first line of each failure')
for n in new:
    print(f'- {n}\n    {first_failure_line(full, n)}')
print()
print('### each suite with a name outside the baseline: solo on the head (fresh DB) and the same suite on main 1b785c48c (fresh DB)')
suites = sorted({n.split(' :: ')[0] for n in new})
for suite in suites:
    stem = os.path.basename(suite).removesuffix('.test.js')
    row = [suite]
    names = {}
    for label in ('solo', 'control'):
        p = raw / f'{label}-{stem}.json'
        if p.exists():
            r = json.loads(p.read_text())
            names[label] = {n.split(' :: ', 1)[1] for n in failures(r)}
            row.append(f"{label}: {r['numPassedTests']} passed {r['numFailedTests']} failed")
        else:
            row.append(f'{label}: not run (see batch.log)')
    full_names = {n.split(' :: ', 1)[1] for n in new if n.startswith(suite + ' :: ')}
    if len(names) == 2:
        row.append('solo and control fail the same names' if names['solo'] == names['control'] else
                   f"names differ: solo only {sorted(names['solo'] - names['control'])}, control only {sorted(names['control'] - names['solo'])}")
        row.append('full-run names = solo names' if full_names == names['solo'] else
                   f"full run only: {len(full_names - names['solo'])}, solo only: {len(names['solo'] - full_names)}")
    print('- ' + ' · '.join(row))
print()
web = raw / 'web.json'
if web.exists():
    w = json.loads(web.read_text())
    print('## web suites related to every web file U1+U2 change against main (jest --findRelatedTests, 42 files)')
    print(counts(w))
    for n in sorted(failures(w)):
        print(f'- FAILED {n}')
tsc = raw / 'web-tsc.txt'
if tsc.exists():
    errors = sum(1 for line in tsc.read_text().split('\n') if 'error TS' in line)
    print(f'web tsc --noEmit: {errors} errors')
