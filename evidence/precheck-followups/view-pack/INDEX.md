# fix/precheck-followups — view-pack (INTERCEPTED renders)

These are **intercepted renders**, not a staging capture. `next dev` of this worktree ran on
127.0.0.1:3219 (NEXT_PUBLIC_PWA_ENABLED=false); no backend ran. `capture-view-pack.js` (headless
Chrome, puppeteer from apps/backend/node_modules) answered every `/api/` call from fixtures in the
script (step 5 requirements payload, incl. `documentId` + `editable`) and from
`evidence/web-quotation-truth/fixtures/quotations-response.json` (step 10). Only
`/api/system-config/public` went unanswered (`{success:true,data:null}`). Measured colours per shot:
`capture-check.txt` (computed style read in the browser).

| shot | what it shows | item |
|---|---|---|
| shots/step5-editable-light.png / -dark.png | two missing required cards on the caution surface (dark: title rgb(242,242,242) on rgb(51,40,12)); "เพราะโรงเรือนระบบปิด" in leaf-onSoft; acknowledged card: disabled "ยืนยันว่าเอกสารถูกต้อง" rgb(143,163,153) on rgb(33,44,38) in dark; "เปิดดูในหน้า" in leaf-onSoft; "ลบไฟล์" enabled on both attached cards | 3a, 3b, 4 |
| shots/step5-delete-confirm-light.png / -dark.png | after pressing "ลบไฟล์" on ใบอนุญาตสมุนไพรควบคุม: the in-page alertdialog with the file name, "ยืนยันลบไฟล์" / "ยกเลิก" (focus on ยกเลิก); no DELETE was sent (capture-check `deletes=[]`) | 4 |
| shots/step5-locked-dark.png | same payload with `editable:false`: both "ลบไฟล์" disabled (`deleteDisabled:[true,true]`) | 4 |
| shots/step10-quotation-light.png / -dark.png | step 10 around the quotation: heading "ใบเสนอราคาของคำขอนี้" and the paragraphs under the checkbox now on the dark card, not on grey | 3c |

Before (for comparison): evidence/document-precheck-2026-09-27/real-stack/ shots 22/23/13 (dark) and
evidence/web-quotation-truth/quotation-step-dark.png.
Not shown here: the delete round trip against a real backend (the DELETE door itself was walked in
evidence/document-precheck-2026-09-27/real-stack step 4; this branch only adds the button).
Seen in these shots, not fixed (BACKLOG-FOUND 2026-09-29 precheck-followups): the wizard header title
("แก้ไขคำขอรับรอง GACP", layout.tsx:126 `text-zinc-900`) is invisible in dark.
