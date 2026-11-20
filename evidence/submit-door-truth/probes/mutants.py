"""Mutants for U2: each restores one defect; the named suite must go red on it."""
import json, pathlib, subprocess, sys
TREE = pathlib.Path('/tmp/submit-mut')
B = 'apps/backend/'
DOOR = '__tests__/integration/applicant-doors-write-only-declared-fields-real-postgres.test.js'
LEGACY = '__tests__/integration/legacy-step-submit-refused-real-postgres.test.js'
M1 = '__tests__/integration/m1-submit-enforcement.test.js'
M2A = '__tests__/integration/m2a-submit-enforcement.test.js'
APPS = B + 'routes/api/applications/applications.js'
REV = B + 'services/application-service/application-review-revision-methods.js'
VAL = B + 'validation/application-submission-validator.js'
GUARD = B + 'services/application-submit-guard.js'
ENGINE = B + 'services/entity-effective-permissions-service.js'
RULES = B + 'services/requirement-rule-service.js'
LENS = B + 'services/application-requirements-service.js'
GATE = B + 'services/application-document-requirements.js'
PREPARE_SPREAD = (APPS, 'const preparedFormData = mergeWizardAnswers(existingFormData, answers);',
                  'const preparedFormData = { ...existingFormData, ...answers };')
REVISION_SPREAD = (REV, '...mergeWizardAnswers(currentFormData, formData),', '...currentFormData, ...formData,')
LEGACY_BRANCH = [
    (VAL, 'function validateFilingCompleteness({ formData, application }) {\n',
     'function validateFilingCompleteness({ formData, application }) {\n'
     '    const steps = (formData && formData.steps) || {};\n'
     '    if ([1, 2, 3, 4, 5, 6, 7, 8, 9].every((n) => steps[n] || steps[String(n)])) { return { isValid: true }; }\n'),
    (APPS, 'const validation = validateFilingCompleteness({ formData: currentFormData, application: draft });',
     'const validation = validateFilingCompleteness({ formData: { ...currentFormData, steps: { ...(currentFormData.steps || {}), ...(payload.steps || {}) } }, application: draft });'),
]
MUTANTS = {
    'M67a /prepare spreads the body into formData': ([PREPARE_SPREAD], DOOR),
    'M67b revision spreads the client formData': ([REVISION_SPREAD], DOOR),
    'M67c /draft create reads the body areaType': ([
        (APPS, 'const areaType = areaTypeFromTicks(formData);',
         "const areaType = areaTypeFromTicks(formData, String(arguments[2].areaType || 'UNDECLARED').toUpperCase());"),
        (APPS, '            serviceType: payload.serviceType,\n            formData: payload.formData,\n        }, draftScope);',
         '            serviceType: payload.serviceType,\n            areaType: payload.areaType,\n            formData: payload.formData,\n        }, draftScope);'),
    ], DOOR),
    'M67d /draft create spreads the body into the Prisma create': ([
        (APPS, '            serviceType: payload.serviceType,\n            formData: payload.formData,\n        }, draftScope);',
         '            serviceType: payload.serviceType,\n            formData: payload.formData,\n            body: payload,\n        }, draftScope);'),
        (APPS, '        ],\n    });\n}\n\n/**\n * Reads never create',
         "        ],\n        ...Object.fromEntries(Object.entries(arguments[2].body || {}).filter(([k]) => k !== 'organizationId' && require('@prisma/client').Prisma.dmmf.datamodel.models.find((m) => m.name === 'Application').fields.some((f) => f.name === k && (f.kind === 'scalar' || f.isList)))),\n    });\n}\n\n/**\n * Reads never create"),
    ], DOOR),
    'M47 the step-keyed branch accepts /submit': (LEGACY_BRANCH, LEGACY),
    'M47rev the step-keyed branch + revision spread': (LEGACY_BRANCH + [REVISION_SPREAD], LEGACY),
    'Mm1-perm the guard skips the permission check': ([(GUARD, '        await assertEntityActionPermission({', '        if (false) await assertEntityActionPermission({')], M1),
    'Mm1-grant the engine ignores GRANT rows': ([(ENGINE, "if (g.effect === 'GRANT' && isValidEntityPermission(g.permission)) {", "if (false && g.effect === 'GRANT') {")], M1),
    'Mm1-revoke the engine ignores REVOKE rows': ([(ENGINE, "        if (g.effect === 'REVOKE') {", '        if (false) {')], M1),
    'Mm1-noentity a holderless filing passes the entity check': ([(GUARD, '    if (!entityId) {', '    if (false) {')], M1),
    'Mm1-audit refusals leave no audit row': ([(GUARD, '    try {\n        await auditLogger.log({\n            category: AuditCategory.APPLICATION,\n            action: SUBMIT_DENIED_ACTION,',
                                                '    try {\n        if (false) await auditLogger.log({\n            category: AuditCategory.APPLICATION,\n            action: SUBMIT_DENIED_ACTION,')], M1),
    'Mm2a-holder holder-specific law binds every holder': ([(RULES, "dimensionClause('holderType', normalizeDimension(holderType)),", '{},')], M2A),
    'Mm2a-evidence document rows are not evidence': ([(LENS, '    (Array.isArray(documentRows) ? documentRows : []).forEach((row) => {\n        const documentType = row?.documentType;', '    ([]).forEach((row) => {\n        const documentType = row?.documentType;')], M2A),
    'Mm2a-stamp a resubmit is judged by today\'s law': ([(GATE, '    if (mode === MODE_RESUBMIT) {\n        const stamp', '    if (mode === MODE_RESUBMIT && false) {\n        const stamp')], M2A),
    'Mm2a-close a closed rule still fires': ([(RULES, '            { OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }] },\n            // All six dimensions', '            {},\n            // All six dimensions')], M2A),
}

def apply(edits):
    for rel, old, new in edits:
        p = TREE / rel
        s = p.read_text()
        if s.count(old) != 1:
            raise SystemExit(f'anchor not unique ({s.count(old)}) in {rel}: {old[:60]!r}')
        p.write_text(s.replace(old, new))

def restore():
    subprocess.run(['git', '-C', str(TREE), 'checkout', '--', 'apps/backend'], check=True)
    if subprocess.run(['git', '-C', str(TREE), 'diff', '--quiet']).returncode != 0:
        raise SystemExit('tree not clean after restore')

results = {}
only = sys.argv[1:]
for name, (edits, suite) in MUTANTS.items():
    if only and not any(o in name for o in only):
        continue
    restore()
    apply(edits)
    log = pathlib.Path('/tmp/submit-work/mut') / (name.split(' ')[0] + '.log')
    log.parent.mkdir(exist_ok=True)
    with log.open('w') as fh:
        rc = subprocess.run(['/tmp/submit-work/jest-at.sh', str(TREE), suite], stdout=fh, stderr=subprocess.STDOUT).returncode
    text = log.read_text()
    failed = [l.strip() for l in text.splitlines() if l.strip().startswith('✕')]
    results[name] = {'exit': rc, 'red': failed}
    print(json.dumps({name: results[name]}, ensure_ascii=False), flush=True)
restore()
pathlib.Path('/tmp/submit-work/' + ('mutants-' + '-'.join(only) if only else 'mutants') + '.json').write_text(json.dumps(results, ensure_ascii=False, indent=1))
