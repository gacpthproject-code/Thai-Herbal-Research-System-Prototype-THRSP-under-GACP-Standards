# รายงานตรวจ PR ค้างเก่า 6 ใบ — 2026-08-04

> คำสั่ง operator: อ่านอย่างเดียว ยังไม่ต้องแก้ · `#686 #680 #619 #560 #554 #461`
> ทุกข้อสรุปในไฟล์นี้มาจากคำสั่งที่รันจริงในเซสชันนี้ ไม่ได้อ่านจากรายงานของใคร
> อ้างอิงสถานะ `origin/main` = **`71707c67`** (2026-08-04)

---

## ⚠️ ข้อค้นพบที่เปลี่ยนคำตอบของทั้งกลุ่ม — history ของ main ถูกตัดเมื่อ 2026-07-08

```
$ git rev-list --count origin/main
299
$ git log --reverse --format='%h %ci %s' origin/main | head -1
922fa333 2026-07-08 17:14:30 +0700 fix(interop): catalogue RESOLVE_CODE_REQUIRED ... (#654)
```

`main` วันนี้มีประวัติย้อนหลังถึงแค่ **8 ก.ค. 2569** เท่านั้น — commit ที่เก่ากว่านั้นไม่มีอยู่ในสายของ `main` อีกแล้ว

ผลคือ **PR ที่เปิดก่อน 8 ก.ค. ไม่มีบรรพบุรุษร่วมกับ main เลย**:

```
$ git merge-base origin/main origin/<branch>
#686  merge-base=670d1e10  2026-07-12   ← มี
#680  merge-base=9a18980a  2026-07-11   ← มี
#619  NO MERGE-BASE (unrelated histories)
#560  NO MERGE-BASE (unrelated histories)
#554  NO MERGE-BASE (unrelated histories)
#461  NO MERGE-BASE (unrelated histories)
```

**สี่ใบล่างกด merge ไม่ได้ตามปกติ** — ต้อง `--allow-unrelated-histories` ซึ่งจะลากประวัติคู่ขนานทั้งสายเข้ามาใน `main` (ไม่ใช่สิ่งที่ใครต้องการ) · ปุ่ม merge บน GitHub อาจแสดงว่าทำได้ แต่ผลลัพธ์คือ merge commit ที่มีพ่อสองคนซึ่งไม่เคยเกี่ยวข้องกัน

> **หมายเหตุความผิดพลาดของผมเอง**: รอบแรกผมรัน `git merge-tree` แล้ว grep หาคำว่า `CONFLICT` อย่างเดียว จึงได้ผลว่า "clean-merge ทั้ง 6 ใบ" — ผิด เพราะ merge-tree ตอบ `fatal: refusing to merge unrelated histories` ซึ่งไม่มีคำว่า CONFLICT ต้องเช็ก exit code ไม่ใช่ grep ข้อความ · แก้แล้วในตัวเลขข้างบน

---

## ⚠️ ข้อค้นพบที่สอง — "CI เขียว" ของทุกใบเป็นของเก่า ไม่ใช่หลักฐานเรื่อง main วันนี้

ไม่มีใบไหน **CI แดง** เลย — แต่ผลที่เห็นคือผลรันครั้งสุดท้ายเมื่อ มิ.ย.–ก.ค. เทียบกับ main คนละตัว

ตัวอย่าง #461: 21 checks ทั้งหมด success/skipped แต่รันเมื่อ **16 มิ.ย. 2569** และตอนนั้นชุด check มี **21 ตัว** ขณะที่วันนี้มี **24 ตัว** (เพิ่ม Secret Scanning/TruffleHog, SAST, real-Postgres guard ฯลฯ) และหายไปบางตัว (`Production Topology Guard`, `Frontend Lint Ratchet`)

⇒ **เขียวเมื่อวาน ≠ เขียววันนี้** ห้ามใช้ผลเก่าตัดสินใจ merge ทุกใบต้องรัน CI ใหม่ก่อน

---

## รายใบ

### #461 — CSP allowlist Cloudflare beacon `chore/csp-cloudflare-beacon` @`830b9d29`
**operator ให้ priority สูงสุดในกลุ่ม (security)**

(1) **เนื้อหา**: เพิ่ม `https://static.cloudflareinsights.com` ใน `script-src` ของ CSP ทั้ง 3 ชั้น + test pin · 4 ไฟล์ +22/−3

(2) **สถานะเทียบ main วันนี้ — ตรวจทีละไฟล์**

| ไฟล์ในดิฟ | สถานะบน main |
|---|---|
| `apps/web-app/src/middleware.ts` | ✅ **มีอยู่แล้ว** — `:80` คือ `"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com"` |
| `deploy/nginx/gacp-platform.conf` | ❌ **ขัดกับดีไซน์ปัจจุบัน** — `:189` เขียนว่า *"No Content-Security-Policy here"* |
| `nginx/gacp.production.conf` | ❌ **ขัดกับดีไซน์ปัจจุบัน** — `:76` เขียนว่า *"deliberately NOT set here, and must not be added back"* |
| `security-headers-middleware.test.ts` | ⚠️ **ยังไม่มีบน main** — test ปัจจุบันมีแค่ `expect(csp).toContain('script-src')` ไม่ได้ pin ชื่อโฮสต์ |

การเปลี่ยน `middleware.ts` เข้า main ไปแล้วผ่าน PR อื่น:
```
$ git log -1 -S "static.cloudflareinsights.com" origin/main -- apps/web-app/src/middleware.ts
9de1e5a3 2026-07-11 debug-zero-warnings: zero errors/warnings + full TS strict-flag migration (#681)
```
ส่วน CSP ที่ชั้น nginx ถูก**ถอดออกโดยตั้งใจ**หลังจากนั้น เหตุผลที่เขียนไว้ในไฟล์: เบราว์เซอร์บังคับ **intersection** ของทุก CSP ที่ได้รับ ชั้น nginx เขียนได้แค่ literal แต่ค่าที่ถูกต้อง (`${backendOrigin}`, `${tileOrigin}`) มีแต่แอปที่รู้ ⇒ literal ที่ชั้นนี้จะ**ลบทอน**นโยบายที่คำนวณถูกแล้วอย่างเงียบ ๆ — ของเดิมคือ `img-src 'self' data: blob:` ซึ่งตัด tile server ขององค์กรทิ้งไปทั้งอัน

(3) **ข้อเสนอ: ปิด #461 — แล้วเปิดใบใหม่เล็ก ๆ เอาเฉพาะ test pin**
- ประเด็นความปลอดภัยที่ PR นี้ต้องการแก้ **แก้ไปแล้ว** (beacon ไม่ถูกบล็อกอีก)
- ดิฟ nginx 2 ใน 4 ไฟล์ ถ้า merge จะ**ย้อนดีไซน์ที่ตั้งใจแก้ทีหลัง** และเอาบั๊ก intersection กลับมา
- merge ตรง ๆ ไม่ได้อยู่แล้ว (ไม่มี merge-base)
- สิ่งเดียวที่ยังมีค่า = test ที่ pin ชื่อโฮสต์ (~8 บรรทัด) ป้องกัน `middleware.ts:80` ถูกลบโดยไม่มีใครรู้ — **คุ้มที่จะทำเป็น PR ใหม่**
- ⚠️ ธง PDPA ในตัว PR ยังไม่ตกไป: CF ประมวลผล IP + user-agent ที่ขอบเครือข่ายในฐานะผู้ประมวลผล และ **beacon ทำงานอยู่บน prod แล้ว** ⇒ ข้อ "เพิ่มบรรทัดผู้ประมวลผลในนโยบายความเป็นส่วนตัว + sign-off" เป็นงานค้างที่ยังต้องทำ **ไม่ว่าจะปิด PR นี้หรือไม่** (ไม่ใช่งานโค้ด — operator/DTAM)

---

### #680 — herb authoritative + rebrand source `claude/herb-authoritative-relabel` @`656abbde`
(1) **เนื้อหา**: 7 ไฟล์ +642/−1 — data JSON 5 ไฟล์ (`BLACK_GALINGALE` `CANNABIS` `GINGER` `KRATOM` `PLAI`) ใน `apps/backend/scripts/herb-content/data-authoritative/` + สคริปต์ `relabel-and-authoritative.js` + แก้ `docs/contract/evidence/item-5-herb-database.md`
**ไม่มีไฟล์ไหนอยู่บน main** — `ls apps/backend/scripts/herb-content/` เห็นแค่ `README.md data import-direct.js import-to-staging.js scan-and-assemble.js` ไม่มี `data-authoritative/` และไม่มีสคริปต์ตัวนี้

(2) **CI**: มี merge-base (`9a18980a`, 11 ก.ค.) · merge-tree สะอาด · ตามหลัง main **274 commits** · ผลเขียวที่เห็นเป็นของ 11 ก.ค.

(3) **ข้อเสนอ: merge — แต่รัน CI ใหม่ก่อน**
เหตุผลที่ควร merge: PR ระบุว่า **ปล่อยลง prod จริงไปแล้ว** (relabel 1,850 แถว, 0 เหลือ `AI_DRAFT`) ⇒ ถ้าไม่ merge **รีโปกับ prod จะไม่ตรงกัน** สคริปต์ที่ใช้จริงและข้อมูลอ้างอิงไม่อยู่ในรีโป ใครที่ต้องรันซ้ำ/ตรวจสอบย้อนหลังจะหาไม่เจอ — นี่คือหนี้ที่แย่กว่าตัว PR
ข้อควรตรวจก่อน merge: ไฟล์เป็น data + สคริปต์ที่ไม่ถูกเรียกอัตโนมัติ ⇒ ความเสี่ยง runtime ต่ำ แต่ **ต้องยืนยันว่า `relabel-and-authoritative.js` ไม่ถูก wire เข้า seed อัตโนมัติ** ไม่งั้นมันจะรันตอน deploy · และ ratchet อาจขยับจาก JSON ขนาดใหญ่ (ต้องดูว่า probe นับ data file ไหม)

---

### #619 · #560 · #554 — สามใบเติม CLAUDE.md บรรทัดเดียว
| PR | branch | เนื้อหา |
|---|---|---|
| #619 | `docs/batch1-crypto-trust-notes` @`b9f6f696` | crypto-trust: แดง = เฉพาะ `integrity==='TAMPERED'` ห้าม gate บน `signatureValid===false` ที่ key-fragile |
| #560 | `docs/stale-pull-race-gotcha` @`a58bb0cf` | stale-pull race: `gh run watch` exit 0 ≠ image ถูก push → `compose pull` ได้ digest เก่า |
| #554 | `docs/uploads-serving-gotchas` @`ae24be67` | document-uploads 4 ชั้น (path 3 ทาง, volume root-owned, nginx `/uploads`, docker bind-mount FILE inode pin) |

(1) **ยังเกี่ยวข้องไหม**: **เนื้อหายังมีค่าสูงมาก** ทั้งสามเป็นบทเรียน production จริงที่ระบุ `file:line` และเลข PR กำกับ — โดยเฉพาะ #554 ที่อธิบายกับดัก inode ของ docker bind-mount แบบไฟล์เดี่ยว ซึ่งเป็นของที่คนจะเจอซ้ำแน่ ๆ

(2) **แต่ปลายทางที่มันเขียนถึงไม่มีอยู่แล้ว**: ทั้งสามแก้ `CLAUDE.md` ฉบับเก่า (ยาว 80+ บรรทัด มีหัวข้อ monorepo / PowerShell / apiClient envelope-strip / Droplet เดียว แยก DB / Image model) · CLAUDE.md วันนี้คือ **v2 — enforcement-bound ยาว 74 บรรทัด** และ
```
$ grep -c "apiClient envelope-strip\|Droplet เดียว แยก DB\|Image model" CLAUDE.md
0
```
ไม่เหลือหัวข้อเดิมสักอัน · ซ้ำร้าย **ไม่มี merge-base** กับ main ด้วย
และ **CLAUDE.md ตอนนี้เป็น operator-owned** — Law 3.12 ห้าม agent แก้ ⇒ ต่อให้ merge ได้ก็เป็นการเขียนไฟล์ที่มีเจ้าของแล้ว

(3) **ข้อเสนอ: ปิดทั้งสามใบ แล้วย้ายเนื้อหาไป `BACKLOG-FOUND.md` (append-only) หรือไฟล์ docs ปฏิบัติการ**
ไม่ใช่การทิ้ง — เป็นการย้ายไปที่ที่ยังมีอยู่จริงและ agent เขียนได้ · ผมเสนอทำเป็น PR เดียวรวมสามบทเรียน อ้าง PR ต้นทาง (#619/#560/#554) และ incident เดิม (#551/#552/#553/#558/#559) เพื่อไม่ให้ที่มาหาย
**ห้ามทำเงียบ ๆ**: ถ้า operator ต้องการให้บทเรียนเหล่านี้อยู่ใน CLAUDE.md จริง ต้องเป็น operator เขียนเอง (Law 3.12)

---

### #686 — screenshot pack 180 ภาพ `claude/playwright-system-screenshots-e4637e` @`a406eaf9`
(1) **เนื้อหา**: 184 ไฟล์ +4704 · `docs/screenshots/full-system-2026-07-16/` (ภาพ 180 + INDEX.md) ถ่ายจาก **staging จริง** 16 ก.ค. ครอบ 151 routes 8 หมวดตาม role
**ไม่มีบน main** — `docs/screenshots` ไม่มีอยู่ในสายของ main เลย

(2) **CI**: มี merge-base (`670d1e10`, 12 ก.ค.) · merge-tree สะอาด · ตามหลัง main **268 commits**

(3) **ข้อเสนอ: ยังไม่ merge — ให้ operator ตัดสินสองข้อก่อน**
- **อายุของภาพ**: ถ่าย 16 ก.ค. · ตั้งแต่นั้น main เดินไป 268 commits รวม **rebrand §C ของ AUTH-01** ที่เปลี่ยนหน้า auth ทั้งชุด และงาน UI อีกหลายรอบ ⇒ ภาพจำนวนไม่น้อย **ไม่ตรงกับ UI ปัจจุบันแล้ว** เอกสารที่ใช้ภาพล้าสมัยไปอ้างอิงจะให้ภาพที่ผิดกับผู้ตรวจ
- **น้ำหนักในรีโป**: 180 ไฟล์ภาพ binary เข้า git ถาวร ทุก clone ต่อจากนี้แบกไปด้วย · ถ้าต้อง re-run ทุกครั้งที่ UI เปลี่ยน (ซึ่ง PR เองก็บอกวิธี re-run ไว้) รีโปจะโตแบบไม่มีเพดาน
- **ทางเลือกที่ผมเสนอ**: (ก) merge เฉพาะ `INDEX.md` + สคริปต์ `doc-screenshots.mjs`/`doc-screenshots-fill.mjs` เก็บ **วิธีสร้าง** ไว้ในรีโป แล้วเก็บภาพไว้นอก git (artifact/drive) · (ข) ถ้าต้องการภาพในรีโปจริง ให้ **ถ่ายใหม่** หลัง AUTH-01 จบ แล้วเปิดใบใหม่ · (ค) merge ทั้งก้อนตามเดิม โดยรับว่าเป็น snapshot ลงวันที่ 16 ก.ค. และ INDEX ระบุวันที่อยู่แล้ว
- ถ้าเป้าหมายคือ "มีภาพประกอบเอกสารส่งผู้ตรวจ**ตอนนี้**" ข้อ (ค) ใช้ได้ทันทีและดีกว่าไม่มีอะไรเลย — แต่ต้องมีข้อความกำกับว่าเป็นภาพ ณ 16 ก.ค. ไม่ใช่สภาพปัจจุบัน

---

## สรุปคำแนะนำ

| PR | CI ล่าสุด | merge-base | ตามหลัง main | ข้อเสนอ |
|---|---|---|---|---|
| **#461** CSP | เขียว (16 มิ.ย. ชุด 21 checks) | **ไม่มี** | 299 | **ปิด** — โค้ดหลักเข้า main แล้วผ่าน #681 · ดิฟ nginx ย้อนดีไซน์ · เปิดใบใหม่เอาเฉพาะ test pin |
| **#680** herb | เขียว (11 ก.ค.) | มี | 274 | **merge** หลังรัน CI ใหม่ + ยืนยันว่าสคริปต์ไม่ถูก wire เข้า seed อัตโนมัติ — prod มีข้อมูลนี้แล้ว รีโปยังไม่มี |
| **#619** docs | — | **ไม่มี** | 299 | **ปิด** — ย้ายเนื้อหาไป BACKLOG/docs |
| **#560** docs | — | **ไม่มี** | 299 | **ปิด** — ย้ายเนื้อหาไป BACKLOG/docs |
| **#554** docs | เขียว | **ไม่มี** | 299 | **ปิด** — ย้ายเนื้อหาไป BACKLOG/docs |
| **#686** screenshots | — | มี | 268 | **รอ operator** — ภาพอายุ 268 commits · เสนอ (ก) เก็บสคริปต์+INDEX ไม่เก็บภาพ |

**ลำดับที่ควรทำ**: (1) ตัดสิน #680 — เป็นใบเดียวที่ปิดช่องว่างระหว่าง repo กับ prod (2) PR ใหม่ย้ายบทเรียนสามใบ + test pin ของ #461 (3) #686 รอหลัง AUTH-01 จบ เพราะ UI ฝั่ง auth กำลังเปลี่ยน

**สิ่งที่ยังไม่ได้ตรวจและควรตรวจก่อนกด**: ทั้ง 6 ใบยังไม่ได้รัน CI ชุดปัจจุบัน (24 checks) — ผลเก่าไม่ใช่หลักฐานเรื่อง main วันนี้

**ไม่ได้แตะโค้ดใด ๆ ในงานนี้** — คำสั่งที่รันมีแต่ `git fetch` / `git merge-base` / `git merge-tree --write-tree` / `git cat-file` / `git log -S` / `ls` / `grep` ซึ่งไม่เขียน working tree · `git status --porcelain` ว่างตลอด
