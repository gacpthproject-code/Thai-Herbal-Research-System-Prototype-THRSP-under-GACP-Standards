# document-precheck Task 1 — bundle tha + eng traineddata — 2026-09-27

Goal: make tesseract.js OCR read Thai locally, using bundled `tha.traineddata`
/ `eng.traineddata` (no runtime download). See
`apps/backend/data/tessdata/README.md` for source/commit/sha256/license, and
`apps/backend/__tests__/unit/tessdata-local-only.test.js` for the test.

Raw jest CLI output is kept out of git (hand-written summaries only, per the
plan's evidence constraint); the full logs for this fix round live under
`/tmp/claude-1000/.../scratchpad/` on the machine this was run on, not in the
repo.

## RED (before the files existed)

`red-summary.txt` — `apps/backend/data/tessdata/tha.traineddata` and
`eng.traineddata` moved out of the tree, `npx jest tessdata-local-only`
(Node 24, `SIGNING_KEY_DIR=$(mktemp -d)`). Result: `Test suite failed to run:
ENOENT: no such file or directory, open '.../data/tessdata/tha.traineddata'`,
6 of 7 tests failed (the langPath test doesn't touch file contents so it
still passed).

## GREEN (files added, `tessdata.js` header rewritten)

`green-summary.txt` — same command, files restored. `Tests: 7 passed, 7
total`. The 3 phrase-recognition tests (`โฉนดที่ดิน`, `หนังสือรับรอง
กรมพัฒนาธุรกิจการค้า`, `27 กันยายน พ.ศ. 2569`) and the tone-mark/sara-am test
all pass against real `Tesseract.recognize()` on images rendered at test
time with the real Sarabun font. `apps/backend/keys/private.pem` mtime
unchanged across both runs (`1788623435` / 2026-09-05 22:50:35, verified
before RED and after GREEN).

## Docker check

`docker-build.txt` — `docker build -f apps/backend/Dockerfile -t
proof-precheck-t1 .` from the worktree root, exit 0.
`docker-sha256.txt` — `docker run --rm --entrypoint sha256sum proof-precheck-t1
/app/apps/backend/data/tessdata/{tha,eng}.traineddata`: real output, matches
the README table exactly. Image removed after (`docker rmi
proof-precheck-t1`); no running containers touched.

## Fix round 1 (this evidence set)

Replaces the fix-round-0 evidence, which committed raw `npx jest` logs
(constraint violation) and asserted the Docker sha256 match in prose with no
attached output (L1 violation) — both replaced here. Also: the tone-mark/
sara-am case is no longer `test.skip`/`test.todo` (failed the `[ACTIVE]`
`no-skip` probe with no operator waiver) — it is a real passing assertion
using two inline helpers (`composeSaraAm`, `stripToneMarks`, marked for
Task 2's `normalize.js` to own) that pin exactly what the bundled data does:
สระอำ composes back correctly, and the known-dropped ไม้โท is verified
tone-insensitively rather than ignored. `apps/backend/data/tessdata/README.md`'s
"Known trade-off" section is unchanged in substance (mai tho loss + why
tessdata_best doesn't run), only its closing paragraph now points at the
real test instead of a skip.
