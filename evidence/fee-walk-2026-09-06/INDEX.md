# กดจริง: คำขอสามรูปแบบ ตั้งแต่สมัครจนถึงใบเสนอราคา

Walked 2026-09-06 on a throwaway Postgres (`fee-walk-db`, 134 migrations applied from
zero — which also proves today's `20260906000000_audit_note_disclosure` deploys) with the
backend booted from the tree on :8099. Real HTTP doors, real rows.

## what it proved, and what it caught

**The submit gate no longer asks for a field no screen writes.** Before this branch, every
filing was refused naming `cultivation_methods` / รูปแบบการปลูก. The walked filing ticked
three ลักษณะพื้นที่ and the refusal no longer mentions it at all — what remains is the
document requirement (`8: files`), which is the กทล.๑ lens doing its job.

**And then it caught a defect no unit test could see.** The filing declared THREE types,
stored and readable in `formData.farmData.areaTypes`, and the first real quotation came out
priced for ONE:

```
QUOTATION QT-PRD-2026-000001 | subtotal 33000 | vat 2310 | total 35310
   PHASE_1 amount 5885 | scopeCount 1
      - SCOPE_1 state 5000 platform 500 vat 385
```

35,310 THB where the operator's ruling makes it 105,930 — short by 70,620 on one filing.

The cause: `_resolveBillableFees` read `storedCultivationScopeCount`, which looks at the
`cultivationScopeCount` / `totalAreaTypes` COLUMNS and falls back to `?? 1`. The six-step
wizard writes neither column. Every unit test passed because they all call the fee engine
with `formData` directly — the disagreement lived in the one hop between them.

## after the fix, same database, same service

```
QUOTATION QT-PRD-2026-000002 | total 105930
  1. ค่าธรรมเนียมกรม (ตรวจประเมิน) แบบกลางแจ้ง งวดที่ 1  =  5,000
  2. ค่าธรรมเนียมกรม (ตรวจประเมิน) แบบโรงเรือน งวดที่ 1  =  5,000
  3. ค่าธรรมเนียมกรม (ตรวจประเมิน) แบบอาคารระบบปิด งวดที่ 1  =  5,000
  1. ค่าธรรมเนียมกรม (ตรวจประเมิน) แบบกลางแจ้ง งวดที่ 2  =  25,000
  2. ค่าธรรมเนียมกรม (ตรวจประเมิน) แบบโรงเรือน งวดที่ 2  =  25,000
  3. ค่าธรรมเนียมกรม (ตรวจประเมิน) แบบอาคารระบบปิด งวดที่ 2  =  25,000
```

Numbered, each naming the cultivation type in the form's own Thai and the instalment it
belongs to, and the total is the sum of the lines — the operator's ruling of 2026-09-06,
on a document.

## the lesson, again
The suite exercised both ends and not the hop between them. `walking-the-real-doors-finds-
what-the-suite-cannot` — and this time what it found was money.
