# Jev รอบ 2 (คำสั่ง 53, 72)

- เรียกครั้งเดียว 2026-10-13 18:49 บน `ace365b8d..fbc61148f` (ทุกการแก้ซอร์สของรอบนี้ก่อนรับความเห็น)
- ส่งไฟล์ซอร์ส 5 ไฟล์ (`uploads-access.js`, สคริปต์ย้าย, `prisma-auth-service.js`, `storage-service.js`, `form-data-ownership.js`) · ไม่มีเลข 13 หลักหลุดใน payload (0 บรรทัด)
- `server.js` ไม่ถูกส่ง: glob `apps/backend/**/*.js` ของ review-branch.sh ต้องมีโฟลเดอร์ย่อย ไฟล์ระดับบนของ backend จึงไม่เคยถูกส่ง (บรรทัด `express.static(BASE_UPLOAD_DIR)` บรรทัดเดียวที่ Jev ไม่เห็น)
- โมเดลที่ตอบ `openai/gpt-6.1-sol` · 47,772 + 4,955 token · 0.17 USD
- สองคอมมิตแก้หลังรับความเห็น (c3f10aaa3, 48b606d47) Jev ไม่ได้ดู เพราะรอบนี้เรียกครั้งเดียวตาม brief

## ตรวจทุกข้อกับโค้ดก่อนทำ

| ข้อ | ระดับ | ตรวจแล้ว | ทำอะไร |
|---|---|---|---|
| 1 การลงทะเบียนเก็บ `privacySettings.avatar` จาก body | HIGH | จริง: `healthRegisterSchema` เป็น passthrough · `registerHealthUser` ลบเฉพาะคีย์สิทธิ์ · `register()` spread ลง `user.create` (เทสต์แดง d360fff16 เห็น avatar ที่ปลอมใน payload) · `notificationSettings` รั่วแบบเดียวกัน | ตัดทั้งสองคีย์ที่ประตูลงทะเบียน (c3f10aaa3) · ต้นเหตุคือรายการห้ามบนประตูที่ schema ปล่อยผ่าน จึงเสนอเปลี่ยนเป็นรายการอนุญาตเป็นงานต่อ |
| 2 nlink ≥ 2 ไม่ได้แปลว่าเป็นอีกรายการ | MEDIUM | จริง: โฟลเดอร์สาธารณะเป็น symlink เข้าที่เก็บ + hard link สำรองที่อื่น → exit 0, already in place 7, รายการในที่เก็บหายทั้ง 7 (เทสต์แดง c365b8cba) | ปฏิเสธเมื่อไฟล์เดียวกันและ (โฟลเดอร์แม่เดียวกัน หรือมีลิงก์เดียว) (48b606d47) · ทำต่อหลังถูกฆ่ายังจบได้ · probe จุดล่มทั้งแปดผลเท่าเดิม |

## คำตอบของ Jev (ตามที่ได้รับ)

### 1. HIGH — Avatar ownership remains forgeable during registration

**Location:** `apps/backend/services/prisma-auth-service.js:662–688, 201–205`; `apps/backend/middleware/uploads-access.js:191–202`

**Defect:** Registration still persists client-supplied `privacySettings.avatar`, allowing an applicant to manufacture the ownership proof used by the root-file upload ACL despite its removal from `updateProfile`.

**Failure scenario:** An attacker knows the URL of another applicant’s root-level ID-card image. They register with their own valid details and include:
```json
{
  "privacySettings": {
    "avatar": "/uploads/<victim-file>.jpg"
  }
}
```
`registerHealthUser` retains this field, and `register` spreads it into the new user row. Once the attacker’s account is active, an authenticated GET for that file passes `resolveRootFileOwner`, which only compares the requested URL against the attacker’s stored avatar value. The victim’s ID-card image is disclosed.

**Visibility limit:** The HTTP registration caller is not supplied; this follows the shown service path, whose comment explicitly describes public registration with a passthrough schema at lines 669–671. Any additional upstream rejection must be verified separately.

### 2. MEDIUM — Link count does not distinguish an alias from a separate destination entry

**Location:** `apps/backend/scripts/ops/move-generated-pdfs-out-of-public.js:175–179, 262–264`; supporting traversal at `77–88, 145–151`

**Defect:** Allowing same-inode sources to be unlinked whenever `nlink >= 2` can delete the destination entry itself when source and destination are aliases and the second hard link exists elsewhere.

**Failure scenario:**
1. `<uploads>/gacp-pdfs` is a symlink to `/vault/gacp-pdfs`.
2. `/vault/gacp-pdfs/invoice.pdf` also has a backup hard link elsewhere, making its link count two.
3. Run the script with `--apply --to /vault`.

The initial listing follows the source-folder symlink, while `directoryIdentities` skips that symlink, so the destination checks do not detect the alias. Placement returns `EEXIST`; identical hashes then reach `unlinkSource`. Because the link count is two, unlinking the source removes the **same directory entry** as `/vault/gacp-pdfs/invoice.pdf`. The script counts the document as “already in place” and can exit successfully although the designated archive entry has disappeared. Only the unrelated backup link remains.