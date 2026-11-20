#!/usr/bin/env python3
"""Add the กทล.1 ข้อ ๒-๓ fields (order 143(4)) to every v2 fixture that predates the rule.
Each anchor must match exactly once, or the file is left untouched and the run fails."""
import json
import sys

WT = '/home/ubuntu/work/wt-filingfields'
SITE = "landDocumentDetail: { type: 'โฉนด', number: '12345' }, coordinates: '13.6069, 100.7061', plantsPerCycle: '500', cyclesPerYear: '2',"
VARIETIES = "varieties: [{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์พันธุ์พืช', quantity: '500', unit: 'ต้น' }],"

EDITS = [
    # backend integration fixtures: the on-site contact line closes farmData
    (f'{WT}/apps/backend/__tests__/integration/filing-legs-read-their-own-clock-real-postgres.test.js',
     "            areaTypes: ['OUTDOOR'], siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,\n        },\n",
     "            areaTypes: ['OUTDOOR'], siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,\n"
     f"            {SITE}\n        }},\n        {VARIETIES}\n"),
    (f'{WT}/apps/backend/__tests__/integration/applicant-submit-walk-web-and-mobile-real-postgres.test.js',
     "            areaTypes: ['OUTDOOR'], siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,\n        },\n",
     "            areaTypes: ['OUTDOOR'], siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,\n"
     f"            {SITE}\n        }},\n        {VARIETIES}\n"),
    (f'{WT}/apps/backend/__tests__/unit/holder-single-source.test.js',
     "            siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,\n        },\n    });\n",
     "            siteContactName: 'สมชาย ใจดี', sitePhone: '0812345678', siteContactIsApplicant: true,\n"
     f"            {SITE}\n        }},\n        {VARIETIES}\n    }});\n"),
    (f'{WT}/apps/backend/__tests__/unit/site-contact-is-required-at-submit.test.js',
     "            province: 'เชียงใหม่', district: 'สันทราย', subDistrict: 'หนองหาร', postalCode: '50290',\n            ...ME,\n            ...farmOverrides,\n        },\n",
     "            province: 'เชียงใหม่', district: 'สันทราย', subDistrict: 'หนองหาร', postalCode: '50290',\n"
     f"            landOwnership: 'OWNED', {SITE}\n            ...ME,\n            ...farmOverrides,\n        }},\n        {VARIETIES}\n"),
    (f'{WT}/apps/backend/__tests__/unit/v2-filing-must-carry-structured-farm-location.test.js',
     "            siteContactIsApplicant: true,\n            ...farmOverrides,\n        },\n    };\n",
     "            siteContactIsApplicant: true,\n"
     f"            landOwnership: 'OWNED', {SITE}\n            ...farmOverrides,\n        }},\n        {VARIETIES}\n    }};\n"),
    # web: the step-3 "complete" fixtures and the step-4 gate inputs
    (f'{WT}/apps/web-app/src/app/health/applications/new/_steps/hooks/__tests__/wizard-v2-step-completion.test.ts',
     "                areaTypes: ['OUTDOOR'], areaSqm: '1600',\n                // the person on site",
     f"                areaTypes: ['OUTDOOR'], areaSqm: '1600',\n                {SITE}\n                // the person on site"),
    (f'{WT}/apps/web-app/src/app/health/applications/new/_steps/hooks/__tests__/wizard-v2-step-completion.test.ts',
     "            ...step1Done, plantId: 'cannabis', certificationPurposes: ['EXPORT'], cultivationMethods: ['outdoor'],\n",
     f"            ...step1Done, plantId: 'cannabis', certificationPurposes: ['EXPORT'], cultivationMethods: ['outdoor'],\n            {VARIETIES}\n"),
    (f'{WT}/apps/web-app/src/app/health/applications/new/_steps/hooks/__tests__/wizard-step-access.test.ts',
     "      areaTypes: ['OUTDOOR'], areaSqm: '1600',\n      // the person on site",
     f"      areaTypes: ['OUTDOOR'], areaSqm: '1600',\n      {SITE}\n      // the person on site"),
    (f'{WT}/apps/web-app/src/app/health/applications/new/_steps/hooks/__tests__/wizard-step-access.test.ts',
     "  certificationPurposes: ['EXPORT'],\n  cultivationMethods: ['OUTDOOR'],\n",
     f"  certificationPurposes: ['EXPORT'],\n  {VARIETIES}\n  cultivationMethods: ['OUTDOOR'],\n"),
    (f'{WT}/apps/web-app/src/app/health/applications/new/_steps/hooks/use-application-flow-store.test.ts',
     "    expect(isStepComplete({ ...almost, certificationPurposes: ['EXPORT'] }, 4)).toBe(true);",
     "    expect(isStepComplete({ ...almost, certificationPurposes: ['EXPORT'] }, 4)).toBe(false);\n"
     "    // order 143(4): ข้อ ๓ names at least one variety\n"
     f"    expect(isStepComplete({{ ...almost, certificationPurposes: ['EXPORT'], {VARIETIES[:-1]} }}, 4)).toBe(true);"),
    (f'{WT}/apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/step4-variety-purpose.test.tsx',
     "        expect(step4CanProceed({ plantId: null, objectives: ['EXPORT'] })).toBe(true);",
     "        expect(step4CanProceed({ plantId: null, objectives: ['EXPORT'], varieties: NAMED })).toBe(true);"),
    (f'{WT}/apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/step4-variety-purpose.test.tsx',
     "        expect(step4CanProceed({ plantId: 'cannabis', objectives: ['RESEARCH', 'PROCESSING'] })).toBe(true);",
     "        expect(step4CanProceed({ plantId: 'cannabis', objectives: ['RESEARCH', 'PROCESSING'], varieties: NAMED })).toBe(true);"),
    (f'{WT}/apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/step4-variety-purpose.test.tsx',
     "        expect(step4CanProceed({ objectives: ['EXPORT'] })).toBe(true);",
     "        expect(step4CanProceed({ objectives: ['EXPORT'], varieties: NAMED })).toBe(true);"),
    (f'{WT}/apps/web-app/src/app/health/applications/new/_steps/steps/__tests__/step4-variety-purpose.test.tsx',
     "import Step4VarietyPurpose from '../step4-variety-purpose';\n",
     "import Step4VarietyPurpose from '../step4-variety-purpose';\n\n"
     "/** order 143(4): ข้อ ๓ names at least one variety, so a passing step-4 input carries one */\n"
     "const NAMED = [{ kind: 'SEED', name: 'หางกระรอกภูพาน', origin: 'DOMESTIC', source: 'ศูนย์พันธุ์พืช', quantity: '500', unit: 'ต้น' }];\n"),
]

failed = False
for path, old, new in EDITS:
    text = open(path, encoding='utf-8').read()
    n = text.count(old)
    if n != 1:
        print(f'ANCHOR x{n}: {path}\n  {old[:80]!r}')
        failed = True
        continue
    open(path, 'w', encoding='utf-8').write(text.replace(old, new))
    print(f'ok {path.split("/")[-1]}')

# the captured real filing: its farmData already carries tenure and the land document
real = f'{WT}/apps/backend/__tests__/fixtures/v2-wizard-real-filing.json'
raw = open(real, encoding='utf-8').read()
data = json.loads(raw)
farm = data['formData']['farmData'] if 'formData' in data else data['farmData']
if 'coordinates' in farm:
    print('ANCHOR: real filing already has coordinates')
    failed = True
else:
    farm.update({'coordinates': '18.7883, 98.9853', 'plantsPerCycle': '500', 'cyclesPerYear': '2'})
    indent = 4 if raw.startswith('{\n    "') else 2
    open(real, 'w', encoding='utf-8').write(json.dumps(data, ensure_ascii=False, indent=indent) + '\n')
    print('ok v2-wizard-real-filing.json')

sys.exit(1 if failed else 0)
