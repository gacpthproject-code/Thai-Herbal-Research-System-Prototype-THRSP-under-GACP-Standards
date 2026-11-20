"""Add the finish run's keys to evidence/dispatcher-r5/redgreen/index.json: the success-step root causes and
fixes, the suites, the screens and the probes. Numbers are read from the run outputs, not typed by hand.
usage: update-index.py <index.json> <final head> <screens dir name>"""
import json, sys

index_path, head, screens_dir = sys.argv[1:4]
fin = '/tmp/dispatcher-r5/finish'
index = json.load(open(index_path, encoding='utf8'))

def jest_numbers(path):
    run = json.load(open(path))
    return {'suites': run['numTotalTestSuites'], 'failed_suites': run['numFailedTestSuites'], 'tests': run['numTotalTests'],
            'passed': run['numPassedTests'], 'failed': run['numFailedTests'], 'skipped': run['numPendingTests']}

def last_line(path):
    return open(path, encoding='utf8').read().strip().splitlines()[-1]

index['success_step'] = {
    'symptom': 'the round-5 screenshot run never saw "ตรวจสอบเอกสารเบื้องต้น" on /health/applications/new/step/12 within 240 s, desktop and phone',
    'environment': 'not the cause: with ENCRYPTION_KEY set, GET /api/entities/mine answered 200 and GET /api/dispatch-due 200 {"dueWorkingDays":1,"effectiveFrom":"2026-10-06"}; the page still judged another application',
    'defects': [
        {
            'cause': 'when IndexedDB answers before React hydrates the wizard page, the hydration render reads the zustand store through its server snapshot (the empty initial state) while useWizardPersistSettled read the live flag (already true); the step page saw a settled, empty wizard, fetched GET /applications/draft and loaded the applicant\'s latest draft over the wizard, so slot 12 judged that DRAFT and said "ยังไม่ได้ยื่นคำขอ"',
            'reach': 'every wizard step reloaded in a browser, not only slot 12: the wizard\'s application id became the server\'s latest open draft and the local answers were marked unsent and saved into it',
            'browser_red': ['success-step/e6324c212/debug-success-desktop-static-page.json', 'success-step/e6324c212/debug-success-phone-static-page.json',
                            'success-step/e6324c212/debug-success-desktop-privacy-page.json', 'success-step/e6324c212/debug-success-phone-privacy-page.json',
                            'success-step/e6324c212/diagnosis-run-backend-requests.txt'],
            'test': 'a0123d286', 'fix': 'e2d5c1645',
            'red': 'success-hydration-red.txt', 'control': 'success-hydration-control-client-render.txt',
            'green': 'success-hydration-green.txt', 'mutation': 'success-hydration-mutation-server-snapshot-live.txt',
            'nearby': 'success-fix1-nearby-suites.txt',
        },
        {
            'cause': 'once slot 12 judged the filed application, opening it changed the wizard store (the step number, the holder the server names); the autosave posted the filed id, the server refused it 409 APPLICATION_NOT_EDITABLE, the autosave dropped the id, saved the answers as a new draft, and the screen turned to "ยังไม่ได้ยื่นคำขอ"',
            'reach': 'the payment slots 10 and 12, which no code path navigates to (typed URL or bookmark only)',
            'browser_red': ['success-step/e2d5c1645/'],
            'test': '3f5943b88', 'fix': '89b84ebbf', 'test_strengthened': 'cd38a2cda',
            'red': 'success-slot-saves-nothing-red.txt', 'observed': 'success-slot-flip-observed.txt',
            'green': 'success-slot-strengthened-green.txt', 'mutation': 'success-slot-mutation-pause-as-hold.txt',
            'nearby': 'success-fix2-nearby-suites.txt',
        },
    ],
    'browser_green': f'{screens_dir}/03-success-step-desktop.png, 03-success-step-phone.png and success-step/{head}/',
}
index['suites'] = {
    'backend_sha': 'e6324c212 (no backend or packages change after it: git diff e6324c212..' + head + ' -- apps/backend packages is empty)',
    'unit_half': jest_numbers('/tmp/dispatcher-r5/half-unit2.json') | {'exit': last_line('/tmp/dispatcher-r5/half-unit2.log'), 'torn_down_lines': 0},
    'integration_half': jest_numbers('/tmp/dispatcher-r5/half-integration2.json') | {'by_name': open(f'{fin}/integration2-compare.txt', encoding='utf8').read().strip().splitlines()[1]},
    'web_jest': {'sha': head} | jest_numbers(f'{fin}/web-full3.json') | {'exit': last_line(f'{fin}/web-full3.log')},
    'tsc': {'sha': head, 'exit': last_line(f'{fin}/tsc3.log')},
}
index['screens'] = {
    'dir': f'evidence/dispatcher-r5/{screens_dir}', 'code_sha': head, 'viewports': ['desktop 1440x900', 'phone 390x844'],
    'index': f'{screens_dir}/shots.json',
    'files': {
        '01': 'wizard step 3: the on-site contact name and phone are required, with the one-tap option',
        '02': 'wizard step 3: someone else on site, with the applicant\'s confirmation that the contact was told',
        '03': 'success step: the filed application, the dispatch rule served by GET /api/dispatch-due (1 working day), still shown 10 s later',
        '04': 'dispatcher booking dialog with an on-site contact, opened on demand',
        '05': 'dispatcher booking dialog without one: ยังไม่มีผู้ติดต่อหน้างาน and when the applicant was asked',
        '05b': 'late-visit reasons with their responsible side (desktop only)',
        '06': 'field inspector page: the on-site contact only',
        '07': 'certificates dashboard without holder e-mail or phone',
        '08': 'applicant page: the recorded reasons in Thai with their sides, and the contact card',
        '09': 'approver decision file: the conflict-of-interest flag',
        '10': 'privacy notice v1.3 covering on-site contacts',
    },
    'not_captured': {
        '05b phone': 'the booking dialog is taller than a 390x844 screen (1024.5 px, top at -90.25) and cannot scroll, so บันทึกนัดหมาย at y 861 is outside the viewport; Playwright: element is outside of the viewport, 60 retries. See 05b-phone-not-captured-save-button-outside-viewport.png. A product defect of the booking dialog, reported, not fixed (not a success-step defect).',
    },
    'measured': 'desktop 1440x900, after the late-visit reasons appear: the dialog is 1405.5 px tall with its top at -252.75, and ยืนยันนัดหมายพร้อมเหตุผล sits at y 1079.75; a trial click says element is outside of the viewport (shots.json notes)',
    'console': 'four React warnings that DateInput passes minDate to a DOM element (existing), and one 409 when the late booking is first sent without a reason (the designed refusal that asks for it); the success step logs no error',
}
index['probes'] = {
    'at_00ca57348': 'probes-at-00ca57348/', 'at_9507c12d1': 'probes-at-9507c12d1/', f'at_{head}': f'probes-at-{head}/',
}
json.dump(index, open(index_path, 'w', encoding='utf8'), ensure_ascii=False, indent=2)
open(index_path, 'a', encoding='utf8').write('\n')
print('index keys:', list(index.keys()))
