# fix/dispatcher-tools round 6 evidence

Code head: dd80766c8 (merge ebecc89cd, dedupe c1155143b, copy test 68de21027 and fix 1ca688b0e, dialog test f21375f6a and fix 73f9ef714, docs dd80766c8).

## Merge and ratchet (`ratchet/`)
- `validate.txt`: `extract-error-codes.js --validate` on the merged tree, 461 codes reconciled.
- `ratchet-merge.txt`: todo 41 > 40 on the merged tree; the extra line is the WorkActivity status name in `OPEN_STATES`.
- `ratchet-after-dedupe.txt`: todo 33 after c1155143b. `ratchet-selftest.txt`: 17/17 cases.

## RED to GREEN (`redgreen/`)
- `dialogs-red-first-spec-c1155143b/`: the first spec (on-screen check only) on the pre-fix tree, 6 failed, 4 passed.
- `dialogs-red-f21375f6a/`: the committed spec on the test commit, 7 failed, 3 passed. The 7th is the document-review assignment dialog on the phone, whose confirm button's bottom edge sits under the phone tab bar.
- `dialogs-green-dd80766c8/`: the same spec at the code head, 10 passed.
- Each folder holds `playwright.txt`, `meta.txt` and the last screen of every test (`<dialog>-<desktop|phone>.png`), taken pass or fail.
- `coordinator-modal-primitive-{red,green}.txt`: the coordinator modal test on the pre-fix export (1 failed) and at the fix (4 passed).
- `inspector-copy-{red,green}.txt`: the inspector banner test before (1 failed, 3 passed) and after (4 passed) the Thai copy.

## Real stack (`screens-dd80766c8/`)
Backend and web of dd80766c8 on a scratch Postgres, desktop 1440x900 and phone 390x844. `shots.json` holds, per state, the button and dialog boxes, the dialog's scroll height and position, and whether a click lands on the button.
- 04a opened, 04b site contact shown, 04c scrolled to "บันทึกนัดหมาย".
- 05 no site contact, 05b late-visit reasons with sides, 05c both reasons scrolled to "ยืนยันนัดหมายพร้อมเหตุผล", 05d saved.
- 06 the inspector page with the Thai banner.

## Suites (`suites/`)
- Backend unit and integration halves at 1ca688b0e; `apps/backend` and `packages` are unchanged through dd80766c8.
- Integration failures by name against the 23 baseline names: 0 new, 0 fixed.
- Web jest and tsc at dd80766c8.

## Probes (`probes-at-dd80766c8/`)
The round-4 security reviewer's P1-P8, both org-scope settings, run with `/tmp/dispatcher-r5/probe-run.sh`.

## Scripts (`scripts/`)
The harness that produced the above. Secrets were read from 0600 files under `/tmp/dispatcher-r6/secret/`, never from arguments.
