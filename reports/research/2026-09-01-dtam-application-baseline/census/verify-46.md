# verify-46 — SKEPTIC check: "water otherSourceType" (census item 46 / farm.md row 35)

Item under challenge:
`{"name":"water otherSourceType","kind":"field","file":"apps/web-app/src/app/health/applications/new/_steps/steps/farm-info-form-sections.tsx","line":337,"currentTh":"ระบุแหล่งน้ำอื่น ๆ (แสดงเมื่อเลือก อื่น ๆ)","verdict":"CUT","note":"Falls with sourceType."}`

Role: defend the farmer's application from an over-eager cut — hunt for ANY named Thai-law
or ministry-system basis requiring this item at APPLICATION time for cannabis.

## Verdict: **UPHELD — CUT**

## 1. What the surface actually is (full branch census)

Read live in `farm-info-form-sections.tsx` (lines below) with Thai labels from
`apps/web-app/src/lib/i18n/dictionaries/sections/th-wizard.ts:472-478`. Siblings carry their
own verify files (verify-43/44/45); listed here because item 46 exists only inside this branch.

| # | Surface | file:line | Current Thai label | Verdict | Citation |
|---|---|---|---|---|---|
| 33 | parent Select `sourceType` | farm-info-form-sections.tsx:319-326 · th-wizard.ts:473 | "ประเภทแหล่งน้ำ" (required) | CUT (upheld by verify-43) | facts.md §1 ส่วนที่ ๒ — exhaustive list ("ทั้งหมดที่ฟอร์มขอ ไม่มีมากกว่านี้"), no water field |
| **35/46** | **conditional TextInput `otherSourceType`** — renders only when `sourceType === 'OTHER'` (:336) | **farm-info-form-sections.tsx:336-350** · th-wizard.ts:475 | **"ระบุแหล่งน้ำอื่น ๆ"** · placeholder "เช่น น้ำบาดาลร่วมกับแหล่งน้ำชุมชน" | **CUT** | — no basis anywhere (see §2) |
| 34 | Select `irrigationType` | :327-333 · th-wizard.ts:474 | "ระบบให้น้ำหลัก (ระดับฟาร์ม)" | CUT (verify-44) | — |
| 36 | multi ChoiceCards `filtrationTypes` | :352-375 · th-wizard.ts:476 | "ระบบกรองน้ำ (เลือกได้หลายรายการ)" | CUT (verify-45) | — |
| 37 | FileInput water testFile | :377-396 · th-wizard.ts:477-478 | "ผลตรวจคุณภาพน้ำ (ถ้ามี)" | OPTIONAL | facts.md §3: ผลตรวจน้ำ ไม่ใช่เอกสารบังคับตอนยื่น |

No other fields, options, checkboxes, slots or upload surfaces exist inside the
`sourceType === 'OTHER'` branch — it is the single TextInput.

## 2. Refutation attempts, all failed

1. **กทล.1 form fields** — facts.md §1 ส่วนที่ ๒ is the complete field list and contains no
   water item of any kind. The only "อื่น ๆ ระบุ" free-text in ส่วนที่ ๒ is under
   ลักษณะพื้นที่ (site type), not water — no analogy carries over.
2. **กทล.1 attachments** — facts.md §2 A1-A8 + qualification groups + renewal/replacement
   lists: no water attachment.
3. **Audit-day reframe (MOVE_TO_AUDIT?)** — facts.md §3 names records (บันทึกปัจจัยการผลิต,
   บันทึกกิจกรรมแปลง) and lab results (ผลตรวจน้ำ — explicitly not mandatory at submission).
   A free-text "specify other water source" is neither a record nor a lab result; §3 does not
   name it. MOVE_TO_AUDIT does not fit.
4. **Named-law sweep** — regex over the repo for (กฎกระทรวง|ประกาศ|พ.ร.บ.) within 120 chars
   of (น้ำ|water): only money/tax instruments, computer-crime discussion, and herb-content
   consumer-law snippets. Nothing requires water-source declaration at application time.
   Consistent with the sweeps logged in verify-36.md:16, verify-43.md:36, verify-44.md:17.
5. **The one repo doc that claims DTAM wants this** — `docs/requirements/dtam-requirements-analysis.md:16-22`
   ("ประเภทแหล่งน้ำ … ต้องขยาย"). Its own header (line 6) says the source is
   "จากคอมเมนต์/บรีฟ" — a brief, not a named กฎกระทรวง/ประกาศ or the กทล.1 form.
   Vibes-level under census rules; superseded by facts.md (coordinator's full-text extract,
   operator ruling 1: required set = กทล.1 exactly).
6. **GACP standard checkpoints** — `data/standards/gacp-thailand.json` ("แหล่งน้ำสะอาดและเพียงพอ",
   "มีแหล่งน้ำสะอาดเพียงพอ") are inspector checkpoints for the audit visit, i.e. §3 territory,
   not application-day form fields.
7. **OPTIONAL / CONDITIONAL / REWORD?** — OPTIONAL is incoherent: the field renders only when
   the parent select (itself CUT, upheld in verify-43) equals OTHER; keeping the child of a
   removed select leaves dead UI. CONDITIONAL requires a named DTAM case (เช่า, Indoor,
   นิติบุคคล…) — an internal UI branch of a cut field is not one. REWORD/GENERATE/KEEP have
   no facts.md row to map to.
8. **Breakage check** — no backend requirement depends on it:
   `apps/backend/validation/application-schemas.js` has zero matches for
   otherSourceType/waterSource/sourceType. The value flows only as optional wizard state
   (`farm-info-step.tsx:137,536`, `hooks/domain-types.ts:164`). Cutting it (with its parent)
   orphans nothing legally required.

## 3. Conclusion

upheld = **true**. Verdict stays **CUT**. The field is a conditional refinement of a field
with no กทล.1 basis; with the parent removed its render condition can never be true, and no
named Thai-law or ministry basis gives it independent life at application time. The census
note "Falls with sourceType." is exactly right.

— skeptic subagent, 2026-09-01 · read-only census · no repo file touched outside census/
