Tree is clean (0 changes) — all mutations reverted.

---

# PASS

ทุกแกนตรวจผ่านด้วยหลักฐานที่รันเอง ไม่มี finding ระดับ material. รายละเอียดต่อแกน (file:line + สิ่งที่รันซ้ำเอง):

## แกน 1 — state anti-CSRF (§D3) — แกนหนักสุด: ตัดสิน **acceptable / non-material / ไม่ใช่ CRITICAL**
เจาะครบทุกเวกเตอร์ที่ dispatch สั่ง:
- **cross-provider**: provider ถูกผูกทั้งใน payload และ HMAC input (`auth-idp.js:77,84`) และ `isStateValid` reject เมื่อ `cookieProvider !== provider` (`auth-idp.js:108`) → state ของ mock ใช้ที่ providerid ไม่ได้.
- **forge expiresAt ใน cookie**: `expiresAt` อยู่ใน HMAC input (`auth-idp.js:77`) และ verify ก่อนใช้ (`auth-idp.js:106-111`) → ยืด TTL ไม่ได้ ลายเซ็นพัง.
- **timing-safe**: `crypto.timingSafeEqual` + length guard ทั้งลายเซ็นและค่า state (`auth-idp.js:87-92,109,112`).
- **replay raw Cookie header ภายใน TTL (notes ข้อ 3)**: **ยืนยันว่าเจาะได้จริง** — probe ของผมส่ง Cookie header ดิบเดิมซ้ำ: `first=200, replay=200, issueTokens.calls=2` (มินต์ session สองใบจาก authorize-url เดียว). "single-use" บังคับแค่ browser layer (clearCookie) ไม่มี server-side nonce store.

**เหตุผลของ severity (ไม่ใช่ความรู้สึก):**
1. Threat model ของ state คือ anti-CSRF — สมมติฐานคือ attacker **อ่าน httpOnly cookie ไม่ได้**. CSRF attacker สร้าง valid state cookie ไม่ได้เลย → เจาะ isStateValid ไม่ผ่าน. การ replay raw cookie ต้อง**ถือ cookie อยู่แล้ว** = อยู่นอก threat model และในสถานการณ์นั้น attacker ขโมย session cookie หลัง login ได้ตรง ๆ อยู่แล้ว — replay ไม่ให้สิทธิ์เพิ่ม.
2. **เส้นที่มินต์ session ซ้ำได้ = mock เท่านั้น** ซึ่ง**ปิดตายบน production** (แกน 3 ยืนยัน). เส้น provider จริงจบที่ 409 ไม่มี session ไม่ว่า replay กี่ครั้ง (`auth-idp.js:346-349`), และ code จริงเป็น one-time ที่ IdP ([P-OAUTH] p.5) → replay บน prod มินต์ session ไม่ได้เลย.
3. implementer เปิดเผยตรง ๆ ใน `notes.md:41` + ธงให้ operator ตัดสิน — ไม่ใช่ fabrication.
→ ไม่มี production security/data-integrity/money impact. anti-CSRF goal ของ §D3 **บรรลุจริงในกรอบ threat model**. Caveat เดียว: test `auth-idp-routes.test.js:235-259` ชื่อ "single-use" พิสูจน์แค่เคส browser-cooperative (agent ทิ้ง cookie) ไม่ใช่ adversarial replay — แต่มัน pin พฤติกรรม clearCookie จริง (ลบ `clearStateCookie` แล้ว test นี้แดง) และ notes ข้อ 3 เปิดเผย gap ตรงกัน ไม่มี overclaim. จัดเป็น non-material.

## แกน 2 — ห้ามสร้าง/ผูก user เส้น provider จริง: PASS
grep `auth-idp.js` = ไม่มี `prisma.user`/`create`/`upsert` เลย. เส้น providerid จบ 409 โดยไม่เรียก user module (lazy require อยู่ใน mock path เท่านั้น `auth-idp.js:202,222`). `findProviderForLoginByHash` (`provider-user-service.js:386-395`) = `prisma.user.findFirst` read-only. Test pin `auth-idp-routes.test.js:479-484` ยืนยัน prisma.user เงียบสนิท + findByHash/issueTokens ไม่ถูกเรียก.

## แกน 3 — mock ปิดบน production: PASS (bulletproof)
Adversarial probe รันเอง (บังคับ `NODE_ENV=production` + `AUTH_MOCK_STATE=enabled`): `isProviderEnabled=false`, effective state=`coming_soon`, `assertProviderReady` throw `AUTH_PROVIDER_DISABLED`, `getIdpAdapter` throw `AUTH_PROVIDER_DISABLED`. สอง guard อิสระ (`auth-providers.js:115-117` + `191-208`).

## แกน 4 — secret/PII ไม่รั่ว: PASS
- state cookie = `v1.<provider>.<state>.<expiresAt>.<hmac>` — ไม่มี secret (มีแค่ digest).
- audit metadata = `{ provider, subjectHash, reason }` เท่านั้น (`auth-idp.js:174-178`); subjectHash=sha256(account_id); test `:508-529,542` pin ว่าไม่มีค่าดิบ.
- `sendCatalogError` ส่งแค่ status/code/message/messageTh — catalog `remediation`/`source` (ที่เอ่ยชื่อ SESSION_SECRET) **ไม่ถูกส่งให้ client** (`api-response.js:100-111` destructuring ตายตัว).
- `logger.error` ทุกจุดล็อกแค่ `error.message` — ไม่มี secret/cookie/PII.

## แกน 5 — CSRF bypass + rate limiter: PASS
- `csrf-middleware.js:49-50` regex anchored `^...$` + segment เดียว `[^/]+` เฉพาะ `/authorize-url` และ `/callback` — ไม่กว้างเกิน; test `:548-556` pin ว่าไม่ครอบ `/other-endpoint`.
- `server.js:276` `app.use(\`${prefix}/auth/idp\`, authLimiter)` ทั้ง `/api` + `/api/v1`; limiter (line 268-280) + CSRF (307) อยู่**ก่อน** API router mount (`server.js:332-333`) → limiter มีผลจริง.

## แกน 6 — RED authenticity: PASS
`red-output.txt`: 29 failed / 0 passed, `Cannot find module` = 0, assertion จริง (แรกสุด `Expected 503, Received 404`; ท้าย `toMatch` line 565). Line numbers ตรงไฟล์ test ปัจจุบัน. นับ test = 29 ตรงไฟล์.

## แกน 7 — Gates (รันเองทั้งหมด): PASS
- jest 4 ไฟล์: **97 passed / 97**.
- `scripts/probes/ratchet.sh`: PASS — hardcode **43**, todo **59**, env-direct **169**, dup-source **4** (ไม่ขยับ).
- `node scripts/extract-error-codes.js --validate`: **293 entries; 293 reconciled** (รันจาก `apps/backend`).
- `node scripts/ci/check-banned-terms.js`: passed.
- grep `.skip|.only` ในไฟล์ test = **0**.

## แกน 8 — Scope: PASS
`git diff --stat c23176a6..ed132dde` = **9 ไฟล์เป๊ะ** ตรง report ไม่มีไฟล์แถม. Docs commit `7a730592` = ไม่แตะไฟล์โค้ดใด (evidence/docs ล้วน) → ไม่มี side effect ต่อโค้ด. Endpoint ที่แตะ wire (authorize-url/callback flow, state, account_id/hash_cid) มี citation ใน [P-OAUTH] (p.2-3,10-12).

---
**Tree สะอาด**: temp probe ลบแล้ว, `git status --short` = 0 บรรทัด. Mutation ทุกตัว revert ครบ.

Reproduce ของหลักฐานหลัก (replay) เก็บที่ `/tmp/claude-0/-home-user-GACP-Certification-Application/ce72fde1-8c42-5c6c-8eb0-452a030eedc8/scratchpad/probe.out` (ไฟล์ probe ถูกลบออกจาก repo แล้ว).