# External standards & Thai law — quotation / invoice / receipt / acceptance chain

Research task F-G4-64. Read-only. No repo files changed, no git mutation, no DB, no `.env`, no keys touched.
Date of research: 2026-08-28. Every claim below carries the URL I actually opened, or is marked UNVERIFIED.

**Extraction note:** several sources are PDFs. Where WebFetch returned only binary, I saved the file and ran
`pdftotext -layout` locally, then quoted from the extracted text. Those local extracts are named per section so
the quote can be re-checked. Thai glyphs do NOT survive `pdftotext` on some Revenue Department PDFs (the font is
not embedded with a ToUnicode map); where that happened I say so and do not invent the Thai wording.

Local extract files (scratchpad, this session):
- `ias-17065-checklist.txt` — from https://www.iasonline.org/wp-content/uploads/2021/02/Tab-3-01-Sample-17065-checklist.pdf
- `iso17065-preview.txt` — from https://cdn.standards.iteh.ai/samples/46568/740b41d2483d48beb9fc63c6c41fd547/ISO-IEC-17065-2012.pdf
- `fsc-cb-requirements.txt` — from https://connect.fsc.org/document-centre/documents/retrieve/cd5f7ce3-86ed-449e-9cde-d1ce1fc69024
- `rd-announce-15.txt` — from the ETDA-hosted ประกาศอธิบดีกรมสรรพากร (ฉบับที่ 15)
- `rd-etax-seminar.txt` — from https://www.rd.go.th/publish/seminar/180820_eTaxInvoice-eReceipt_doc.pdf (Thai glyphs lost)

---

## Q1 — Which documents are tax documents under the Revenue Code, and is a ใบเสนอราคา one of them?

### 1.1 ใบกำกับภาษี — timing (ม.86)

**Source opened:** https://www.rd.go.th/5208.html (Revenue Department, page titled "มาตรา 85_86", within หมวด 4 ภาษีมูลค่าเพิ่ม)

Passage returned from that page:

> "ต้องจัดทำในทันทีที่ความรับผิดในการเสียภาษีมูลค่าเพิ่มเกิดขึ้น"

So the timing rule is **not** "when you invoice" or "when you decide to" — the tax invoice must be issued
**immediately at the moment the VAT liability (tax point) arises**. The tax point itself is defined elsewhere.

**The tax point for services — ม.78/1**

**Source opened:** https://www.rd.go.th/5205.html (Revenue Department, page titled "มาตรา 77_79")

> "ให้ความรับผิดทั้งหมดเกิดขึ้นเมื่อได้รับชำระราคาค่าบริการ"

with the exception clause:

> "เว้นแต่กรณีที่ได้มีการกระทำดังต่อไปนี้เกิดขึ้นก่อนได้รับชำระราคาค่าบริการ ก็ให้ถือว่าความรับผิดเกิดขึ้นเมื่อได้มีการกระทำนั้น ๆ ด้วย"

— the earlier-triggering acts being (ก) issuing a tax invoice, and (ข) the service being used.

**This is the operative rule for a GACP certification fee.** A certification fee is a *service*. Therefore the
VAT tax point is **receipt of payment**, and ม.86 then requires the ใบกำกับภาษี to be issued **immediately at
that moment** — i.e. at settlement, not at some later admin step. (Issuing the tax invoice earlier is legal but
*pulls the tax point forward* to the issue date under the ม.78/1 exception — which is exactly why a
"tax invoice" must never be emitted at the quotation or order-created step.)

### 1.2 ใบกำกับภาษี — required particulars (ม.86/4)

**Source opened:** https://www.rd.go.th/5208.html

> "(1) คำว่า "ใบกำกับภาษี" ในที่ที่เห็นได้เด่นชัด
> (2) ชื่อ ที่อยู่ และเลขประจำตัวผู้เสียภาษีอากรของผู้ประกอบการจดทะเบียน…
> (3) ชื่อ ที่อยู่ของผู้ซื้อสินค้าหรือผู้รับบริการ
> (4) หมายเลขลำดับของใบกำกับภาษี และหมายเลขลำดับของเล่มถ้ามี
> (5) ชื่อ ชนิด ประเภท ปริมาณ และมูลค่าของสินค้าหรือของบริการ
> (6) จำนวนภาษีมูลค่าเพิ่มที่คำนวณจากมูลค่าของสินค้า…
> (7) วัน เดือน ปี ที่ออกใบกำกับภาษี
> (8) ข้อความอื่นที่อธิบดีกำหนด"

Note (4): the **sequential number is a statutory particular**, not a convenience. And note the prohibition on
the same page:

> ม.86/13 — "ห้ามมิให้บุคคลซึ่งมิใช่ผู้ประกอบการจดทะเบียนหรือมิใช่ผู้มีสิทธิออกใบกำกับภาษี…ออกใบกำกับภาษี ใบเพิ่มหนี้ หรือใบลดหนี้"

A non-registrant that issues a document labelled ใบกำกับภาษี becomes liable for the VAT on it as if registered.
Practical consequence: **never label a document ใบกำกับภาษี unless the issuing legal entity is VAT-registered.**

### 1.3 ใบรับ / ใบเสร็จรับเงิน — ม.105 and the ม.103 definition

**Source opened:** https://www.rd.go.th/5203.html (Revenue Department, page titled "มาตรา 103_129")

ม.103 defines "ใบรับ" as:

> (ก) "บันทึก หรือหนังสือใด ๆ ที่เป็นหลักฐานแสดงว่าได้รับ ได้รับฝากหรือได้รับชำระเงิน"
> (ข) "บันทึก หรือหนังสือใด ๆ ที่เป็นหลักฐานแสดงว่าหนี้หรือสิทธิเรียกร้องได้ชำระ"

and the page notes such a document does not require anyone's signature to qualify.

ม.105 — the duty and its timing:

> "ผู้ขาย ผู้ให้เช่าซื้อ ผู้รับเงิน หรือผู้รับชำระราคาต้องออกใบรับให้แก่ผู้ซื้อ ผู้เช่าซื้อ ผู้จ่ายเงิน…"
> "…ในทันทีทุกคราวที่รับเงินหรือรับชำระราคา"

Threshold caps (the Director-General sets the actual figure, the statute caps his discretion):

> for VAT/SBT registrants — "เกินจำนวนเงินตามที่อธิบดีกำหนด แต่อธิบดีจะกำหนดเกินหนึ่งพันบาทไม่ได้"
> otherwise — "เกินจำนวนเงินตามที่อธิบดีกำหนด แต่อธิบดีจะกำหนดเกินหนึ่งหมื่นบาทไม่ได้"

ม.105 ทวิ — retention: originals or copies kept **not less than five years**.
ม.105 ตรี — for sub-threshold receipts, a daily total must be recorded and kept five years.

**So the two legally-timed documents are: ใบกำกับภาษี (immediately at the tax point, ม.86) and ใบรับ
(immediately on every receipt of money, ม.105). Both are "immediately", both are tied to the money event.**

### 1.4 Is a ใบเสนอราคา a tax document?

**No — and the evidence is the absence of it from the primary text.** I searched both Revenue Code chapters
that define the document set:

- https://www.rd.go.th/5208.html (VAT / ใบกำกับภาษี chapter, ม.85–86/x): the word **"ใบเสนอราคา" does not
  appear anywhere on the page**.
- https://www.rd.go.th/5203.html (ม.103–129, the ใบรับ / อากรแสตมป์ chapter): **neither "ใบเสนอราคา" nor
  "ใบแจ้งหนี้" appears anywhere on the page.**

Corroborating positive evidence from the Revenue Department's own e-Tax instrument (see Q3): the exhaustive list
of documents the RD lets you issue electronically is ม.86/4, ม.86/6, ม.86/9, ม.86/10, ม.105 ทวิ — a quotation is
not among them.

**Conclusion for Q1:** ใบกำกับภาษี and ใบรับ/ใบเสร็จรับเงิน are the tax documents with statutory timing rules.
**ใบเสนอราคา is not a tax document at all** — it carries no Revenue Code issuance duty, no timing rule, no
mandatory particulars, no retention rule, and no numbering requirement. It is a purely *commercial/contractual*
document. ใบแจ้งหนี้ (invoice) is likewise **not** a Revenue Code tax document in its own right — it only
becomes one if it doubles as a ใบกำกับภาษี bearing the ม.86/4 particulars.

*Caveat on method:* this is negative evidence from two chapters of the Code. I did not read every chapter of the
Revenue Code end-to-end. The claim "ใบเสนอราคา is nowhere in the Revenue Code" is therefore **stated as: it is
absent from the two chapters that define tax-document duties, and absent from the RD's own e-Tax document list.**

---

## Q2 — CCC: effect of paying a quotation without express acceptance

### 2.1 Source status — read this before relying on the quotes

**I could NOT open an authoritative government source for the CCC text.** Specifically:
- `krisdika.go.th` (Office of the Council of State) — no CCC HTML/PDF surfaced in search that I could open.
- `deka.in.th` (Supreme Court decision database) — **HTTP 403 Forbidden**, could not open.
- `peesirilaw.com` — WebFetch returned text that was **plainly wrong** (it produced loan/bailment wording for
  ม.354–361). **I discarded it entirely.** Flagging this because it is an active trap: that fetch produced
  confident, fluent, wrong Thai law.

What I did open, and the section text is **consistent across three independent non-official sources**:
- https://thai-civil-code.blogspot.com/2009/08/blog-post_3064.html (ม.354, 356, 357, 359, 360, 361, 366)
- https://www.legardy.com/thai-law/civil-commercial/civil-and-commercial-section361 (ม.361)
- search-result summaries quoting ม.361 identically

**Status: the section numbers and their substance are cross-confirmed across three sources, but the wording is
UNVERIFIED against an official Krisdika/Ratchakitcha text.** Do not paste these strings into a legal notice or a
contract template without an operator/lawyer checking them against the official Code.

### 2.2 The sections

> **ม.354** — "คำเสนอจะทำสัญญาอันบ่งระยะเวลาให้ทำคำสนองนั้น ท่านว่าไม่อาจจะถอนได้ภายในระยะเวลาที่บ่งไว้"
> (An offer stating a period for acceptance cannot be withdrawn within that period.)

> **ม.356** — "คำเสนอทำแก่บุคคลผู้อยู่เฉพาะหน้า โดยมิได้บ่งระยะเวลาให้ทำคำสนองนั้น เสนอ ณ ที่ใดเวลาใดก็ย่อมจะสนองรับได้แต่ ณ ที่นั้นเวลานั้น"

> **ม.357** — "คำเสนอใดเขาบอกปัดไปยังผู้เสนอแล้วก็ดี หรือมิได้สนองรับภายในเวลากำหนดดังกล่าว…คำเสนอนั้นท่านว่าเป็นอันสิ้นความผูกพันแต่นั้นไป"
> (An offer refused, or not accepted within its period, **lapses**.)

> **ม.359** — "ถ้าคำสนองมาถึงล่วงเวลา ท่านให้ถือว่าคำสนองนั้นกลายเป็นคำเสนอขึ้นใหม่"
> (A late acceptance is treated as a **new offer**.)

> **ม.360** — "บทบัญญัติแห่งมาตรา ๑๖๙ วรรคสอง นั้น ท่านมิให้ใช้บังคับ ถ้าหากว่าขัดกับเจตนาอันผู้เสนอได้แสดง"

> **ม.361 วรรคหนึ่ง** — "อันสัญญาระหว่างบุคคลซึ่งอยู่ห่างกันโดยระยะทางนั้น ย่อมเกิดเป็นสัญญาขึ้นแต่เวลาเมื่อคำบอกกล่าวสนองไปถึงผู้เสนอ"
> (Between parties at a distance, the contract arises **when the notice of acceptance reaches the offeror**.)

> **ม.361 วรรคสอง** — "ถ้าตามเจตนาอันผู้เสนอได้แสดง หรือตามปรกติประเพณีไม่จำเป็นจะต้องมีคำบอกกล่าวสนองไซร้…สัญญานั้นเกิดเป็นสัญญาขึ้นในเวลาเมื่อมีการอันใดอันหนึ่งขึ้น"
> (If, by the offeror's expressed intention **or by ordinary usage**, a notice of acceptance is not necessary,
> the contract arises **at the time of the act** which is to be regarded as the declaration of acceptance.)

> **ม.366** — "ข้อความใด ๆ แห่งสัญญาอันคู่สัญญาแม้เพียงฝ่ายเดียวได้แสดงไว้ว่าเป็นสาระสำคัญ…เมื่อกรณีเป็นที่สงสัย ท่านนับว่ายังมิได้มีสัญญาต่อกัน"
> (Where a term either party declared essential is not agreed, **in case of doubt there is no contract**.)

### 2.3 The answer

**Yes — paying the quoted amount ordinarily forms a contract, by conduct, under ม.361 วรรคสอง.** A ใบเสนอราคา
that is definite as to service, scope and price is a **คำเสนอ (offer)**. Payment of exactly that amount is "การ
อันใดอันหนึ่ง…อันจะพึงถือได้ว่าเป็นการแสดงเจตนาสนองรับ" — an act regarded as a declaration of acceptance —
and by ordinary commercial usage (ตามปรกติประเพณี) a separate notice of acceptance is not required. The contract
is formed **at the moment of that act**, i.e. at payment, not at some later confirmation.

**But three real limits, all from the sections above:**

1. **ม.357 / ม.359 — expiry.** If the quotation stated a validity period and payment lands after it, the offer
   has already lapsed. The late payment is then a **new offer** (ม.359) which the certification body must
   itself accept. A system that lets a customer pay a stale quotation and treats it as automatically binding at
   the *old* price is legally exposed. **A quotation must carry an expiry, and payment after expiry must not
   silently bind.**
2. **ม.366 — essential terms.** If any term either side flagged as essential (scope of certification, audit
   inclusions, re-audit fees, refund terms) is not actually agreed, then *in case of doubt* no contract has
   formed — payment notwithstanding. Acceptance-by-conduct only binds the terms that were actually on the
   quotation. **Anything not on the quotation is not in the contract.**
3. **Evidentially, conduct is weaker than a record.** ม.361 วรรคสอง makes the contract valid; it does not make
   it *provable*. In a dispute the certification body must prove which version of the quotation the customer
   saw. That is a system-design requirement: **snapshot the exact priced document the customer was shown at the
   moment of payment, immutably, and bind the payment to that snapshot** — not to a mutable current price row.

**UNVERIFIED:** I could not open a Supreme Court (ฎีกา) decision confirming the specific fact-pattern
"customer paid the quotation, no separate acceptance". A secondary source (legardy) referenced ฎีกา 15238/2553
for the related pattern "purchase order matching the quotation = valid acceptance", but **deka.in.th returned
403 and I could not read the judgment itself.** Treat the case citation as unconfirmed.

---

## Q3 — Thai e-Tax invoice / e-Receipt guidance on the document chain

### 3.1 What the Revenue Department's own instrument covers

**Source opened:** ประกาศอธิบดีกรมสรรพากร (ฉบับที่ 15), hosted by ETDA —
https://www.etda.or.th/getattachment/53999552-a179-498b-a308-e54db42382e7/ประกาศอธบดกรมสรรพากร-(ฉบบท-15).aspx

Documents issuable electronically under e-Tax Invoice & e-Receipt, with their Revenue Code anchors:

| Document | Revenue Code section |
|---|---|
| ใบกำกับภาษี | ม.86/4 |
| ใบกำกับภาษีอย่างย่อ | ม.86/6 |
| ใบเพิ่มหนี้ | ม.86/9 |
| ใบลดหนี้ | ม.86/10 |
| ใบรับ | ม.105 ทวิ |

**Extraction status:** I ran `pdftotext -layout` on the saved PDF (`rd-announce-15.txt`). The **Thai glyphs did
not extract** (font without ToUnicode), but the **section numbers survived and confirm the structure**:
`rd-announce-15.txt:161` → `86/4`; `:183` → `86/6`; `:194` → `86/9  86/10`; `:200` → `105`; and the enumerated
list at `:469-472` → `1.1 86/4 / 1.2 86/9 / 1.3 86/10 / 1.4 105`. The mapping of each number to its Thai
document name is from the WebFetch reading of the same PDF, which read the Thai correctly.

**ใบเสนอราคา and ใบแจ้งหนี้ are not in this list.** The e-Tax instrument regulates only the tax documents.

### 3.2 Does any RD/ETDA guidance describe the chain quotation → invoice → receipt/tax invoice?

**Not in anything I was able to open — this is the weakest link in the research.**

- ETDA's standards portal `standard.etda.or.th` (both `?p=6865` and `?page_id=7739`) **301-redirects** to a
  generic landing page `https://www.etda.or.th/th/Our-Service/Standard.aspx`; the standard's document-type list
  is not reachable there.
- https://opendata.etda.or.th/dataset/dataset_16_03 — opened. It confirms **ขมธอ. 3-2560 "ข้อความอิเล็กทรอนิกส์
  สำหรับการซื้อขายสินค้าและบริการ" v2.0** exists and that its purpose is "สนับสนุนการทำธุรกรรมทางอิเล็กทรอนิกส์
  ทั้งภาครัฐและเอกชน". **The page does not list the document types.** I could not open the standard PDF itself.
- https://www.rd.go.th/publish/seminar/180820_eTaxInvoice-eReceipt_doc.pdf — downloaded and extracted
  (`rd-etax-seminar.txt`, 750 lines) but **the Thai glyphs are lost in extraction**; only `86/4` survives
  (`rd-etax-seminar.txt:193`). **Unusable as a quotable source.**

**UNVERIFIED:** whether ขมธอ. 3-2560 includes ใบเสนอราคา (Quotation) as one of its defined electronic message
types, and whether ETDA or the RD anywhere prescribes an ordered chain quotation → PO → invoice → receipt.
Search snippets asserted both ways (one said the standard "covers quotations, purchase orders and invoices",
another listed only e-Invoice/e-Receipt/e-Tax Invoice/debit/credit notes). **I did not open the standard, so I
am not resolving that conflict.** If this matters to the design, the operator should obtain ขมธอ. 3-2560 v2.0/3.0
directly from ETDA.

**What I can state on primary evidence:** Thai tax law regulates only the *downstream* end of the chain — the
tax invoice and the receipt, both triggered by the money event. It imposes **no duty at all** on the upstream
quotation step. Any quotation→acceptance requirement in this system must therefore be justified on **contract
law (Q2) and certification-standard (Q4) grounds, not tax grounds.**

---

## Q4 — ISO/IEC 17065 and IAF: must the client agree to fees before the service?

### 4.1 The legally enforceable agreement — 4.1.2.1 (from the official ISO text)

**Source opened:** the official ISO/IEC 17065:2012 preview PDF —
https://cdn.standards.iteh.ai/samples/46568/740b41d2483d48beb9fc63c6c41fd547/ISO-IEC-17065-2012.pdf
extracted locally to `iso17065-preview.txt`; clause 4.1.2 body text **is** inside the preview
(`iso17065-preview.txt:505-523`). The extracted line carries an interleaved iteh watermark; de-interleaved:

> **4.1.2.1** "The certification body shall have a legally enforceable agreement for the provision of
> certification activities to its clients. Certification agreements shall take into account the responsibilities
> of the certification body and its clients."

> **4.1.2.2** "The certification body shall ensure its certification agreement requires that the client comply
> at least, with the following: a) the client always fulfils the certification requirements…"

**The preview stops at page 6 (mid clause 4.2.8).** Clauses 4.6, 7.2 and 7.7 are **not** in the official
preview, so the quotes below come from a third-party reproduction.

### 4.2 Fees — clause 4.6.1(b)

**Source opened:** IAS ISO/IEC 17065 Sample Checklist Rev 2.0 (International Accreditation Service — an
accreditation body reproducing the clause text verbatim) —
https://www.iasonline.org/wp-content/uploads/2021/02/Tab-3-01-Sample-17065-checklist.pdf
extracted to `ias-17065-checklist.txt`.

> **4.6 Publicly Available Information** (`ias-17065-checklist.txt:220-235`)
> "4.6.1 The certification body shall maintain (through publications, electronic media or other means), and
> make available upon request, the following: …
> **(b) A description of the means by which the certification body obtains financial support and general
> information on the fees charged to applicants and to clients;**
> (c) A description of the rights and duties of applicants and clients…"

### 4.3 The hard gate — clause 7.7.3(c)

> **7.7.3** (`ias-17065-checklist.txt:655-661`) "Formal certification documentation (see 7.7) shall only be
> issued after, or concurrent with, the following:
> (a) the decision to grant or extend the scope of certification (see 7.6.1) has been made;
> (b) certification requirements have been fulfilled;
> **(c) the certification agreement has been completed/signed.**"

### 4.4 Clause 7.2 — Application

> **7.2 Application** (`ias-17065-checklist.txt:484-489`) "For application, the certification body shall obtain
> all the necessary information to complete the certification process in accordance with the relevant
> certification scheme."

(The IAS checklist also renders 4.1.2.1 with a cross-reference "(see also 7.2)" at `:15-16`, which the official
ISO preview text does not show. Treat the cross-reference as IAS's editorial aid, not ISO wording.)

### 4.5 Corroboration from a real accredited scheme

**Source opened:** FSC-STD-20-001 V5-0 EN, "General Requirements for Certification Bodies", approved
2025-02-27, effective 2025-10-01 —
https://connect.fsc.org/document-centre/documents/retrieve/cd5f7ce3-86ed-449e-9cde-d1ce1fc69024
extracted to `fsc-cb-requirements.txt`. This standard states it is in "full alignment with ISO/IEC 17065:2012"
(`fsc-cb-requirements.txt:52-55`).

> `fsc-cb-requirements.txt:624-626` — the certification agreement shall require the organization to
> "k) agree, that the certification body and FSC have the right to revise the certification requirements within
> the period of validity of the certification, **including the revision of costs and fees**;"

> `fsc-cb-requirements.txt:1655` — maintaining certification requires that the organization
> "d) **continues to pay all specified fees and costs in a timely manner**;"

So in a live ISO 17065-aligned scheme, **fees are an express term of the certification agreement**, and both
"agreed fees" and "revision of fees" are contractual matters, not billing-system matters.

### 4.6 The answer — carefully

**What ISO/IEC 17065 *does* require:**
1. A **legally enforceable agreement** with the client for the provision of certification activities (4.1.2.1).
   "Legally enforceable" is satisfied by a contract validly formed — which, under Thai ม.361 วรรคสอง, a
   payment-by-conduct contract can be. The standard does **not** prescribe a signature, a wet-ink form, or a
   specific document type.
2. **Fee transparency**: general information on fees charged to applicants and clients must be maintained and
   **made available on request** (4.6.1(b)). Note the bar: *available on request*, not *individually accepted*.
3. A **hard gate at issuance**: certification documentation may only be issued after or concurrent with the
   agreement being **completed/signed** (7.7.3(c)).

**What ISO/IEC 17065 does NOT require — and I want this stated plainly rather than glossed:**
- It does **not** name a "quotation", and does not require an *accepted quotation* as a document.
- It does **not** say the agreement must be signed before the *evaluation* begins. I grepped the FSC standard
  for any "agreement signed before / prior to evaluation" requirement and **found none** — the only "prior to"
  clauses concern transfers of certification and record migration (`fsc-cb-requirements.txt:1202, 1810, 2737,
  2748`). The explicit timing gate in the standard is at **7.7.3(c) — before issuing the certificate.**
- So the honest reading: **an accepted quotation is a sound way to satisfy 4.1.2.1 + 4.6.1(b) + 7.7.3(c), but it
  is not itself a named requirement of the standard.** Anyone claiming "ISO 17065 requires an accepted
  quotation" is over-reading it. What the standard requires is an enforceable agreement whose terms (including
  fees, per the FSC evidence) are established, and proof of it before the certificate is issued.

### 4.7 IAF guidance

**UNVERIFIED / NOT FOUND.** I searched for an IAF mandatory document addressing fee agreement or the
certification contract and **did not open one that speaks to fees before the service**. The IAF MDs surfaced by
search (MD 1 multi-site, MD 6, MD 11, MD 17) are scope/audit-methodology documents, not contractual/fee
documents. **I am not asserting that no such IAF document exists — only that I did not find or open one.**

---

## Q5 — Stripe: does Stripe recommend or require capturing quote acceptance before payment?

### 5.1 The Quotes object and its lifecycle

**Source opened:** https://docs.stripe.com/quotes ("How quotes work")

> "Quotes allow you to provide your customers with a price estimate for requested goods or services… **After
> your customer accepts the quote**, you can convert it into a recurring subscription or a one-time invoice."

Documented status machine, verbatim from the page:

```
[Draft] --> [Open]
[Draft] --> [Canceled]
[Open]  --> [Accepted]
[Open]  --> [Canceled]
```

> `draft` — "The starting status for all quotes."
> `open` — "The quote is finalized and **awaiting action from the customer**. You can only edit the expiration date."
> `accepted` — "**The customer accepted the quote.** The quote generates an invoice, subscription, or subscription schedule."
> `canceled` — "The quote expired or was canceled. **You can no longer accept it.**"

> **Accept a quote** — "After your customer agrees to the quote, you can mark the `open` quote as `accepted`.
> Accepted quotes automatically generate an invoice, subscription, or subscription schedule."
> "**Quotes without recurring prices**: A `draft` invoice is created with `auto_advance` set to `false`. You can
> modify the invoice before finalizing and sending it to your customer for payment."

**Source opened:** https://docs.stripe.com/api/quotes/accept

> "Accepts the specified quote."
> Request: `POST https://api.stripe.com/v1/quotes/{QUOTE_ID}/accept`
> Returns: "**Returns an accepted quote and creates an invoice, subscription or subscription schedule.**"
> The example response shows `"status": "accepted"` with `"status_transitions": {"accepted_at": 1680129227, …}`
> and a populated `"invoice": "in_1Mr7YtLkdIwHu7ixzgJJpJ3L"`.

Acceptance also emits a **`quote.accepted` webhook** (per https://docs.stripe.com/quotes).

### 5.2 The critical nuance — who performs the acceptance

**`POST /v1/quotes/:id/accept` is a merchant-side call.** Read the wording exactly: *"After your customer agrees
to the quote, **you** can mark the open quote as accepted"*, and the Dashboard path is *"select the quote… click
**Convert to invoice**"*. **Stripe records the merchant's assertion that the customer agreed. Stripe does not
itself capture the customer's act of acceptance.** There is no signature, no customer-facing accept button
described on that page.

**UNVERIFIED:** whether Stripe offers a customer-facing hosted quote-acceptance page or e-signature. I searched
for it and **did not find or open** documentation for such a feature. The `/quotes` page documents only the
Dashboard and API acceptance paths, plus a quote **PDF** download (`GET /v1/quotes/{id}/pdf`).

### 5.3 Does Stripe require it before a payment? No.

**Source opened:** https://docs.stripe.com/payments/checkout ("Build a payments page")

The entire Checkout landing page — three payment UIs, all built on the **Checkout Sessions API** — **makes no
mention of Quotes at all**, and no acceptance step appears anywhere in the documented flow. Quotes are gated
behind a separate paid product: per https://docs.stripe.com/quotes, to send and accept quotes you must "On the
Your plans page, sign up for **Invoicing Plus**."

**So the answer is explicit: Stripe neither requires nor recommends capturing quote acceptance before creating a
payment.** Quotes and Checkout are separate products. You can create a Checkout Session and charge a customer
with no Quote object in existence. Stripe *provides* an acceptance state for merchants who want a quoting
workflow; it *imposes* nothing.

### 5.4 What Stripe Checkout does offer for capturing agreement

**Source opened:** https://docs.stripe.com/api/checkout/sessions/object (Checkout Session object)

> `consent_collection` (object, nullable) — "When set, provides configuration for the Checkout Session to
> **gather active consent from customers**."
> `consent` (object, nullable) — "**Results of `consent_collection` for this session.**"

Both are **nullable and default to `null`** in the documented example object — i.e. **consent capture in
Checkout is opt-in, off by default.** This is the mechanism inside Checkout for recording that a customer
actively agreed to something at the moment of payment, and it is the natural Stripe-native place to bind a
terms/quotation acceptance to the payment event without adopting the Invoicing-Plus Quotes product.

(I opened https://docs.stripe.com/payments/checkout/collect-additional-info hoping for the
`terms_of_service_acceptance` prose; that page is only a link index and **does not** contain the parameter
description. The field definitions above are from the API reference, which I did open.)

---

## Synthesis — what the five answers jointly support

1. **Tax law does not require a quotation step.** ใบเสนอราคา is not a tax document (Q1). Tax law's only hard
   timing rules bite at the money event: ใบกำกับภาษี immediately at the tax point, which for a *service* is
   **receipt of payment** (ม.78/1 + ม.86), and ใบรับ immediately on every receipt (ม.105).
2. **Therefore the tax documents belong at settlement, not at order-creation.** Emitting a document labelled
   ใบกำกับภาษี before payment does not merely mislabel it — under the ม.78/1 exception it **pulls the VAT tax
   point forward to the issue date**, creating a real liability early. And under ม.86/13 a non-VAT-registered
   entity must not label anything ใบกำกับภาษี at all.
3. **Contract law does the work the tax law doesn't.** Paying a quotation forms a contract by conduct
   (ม.361 วรรคสอง) — so a payment-first flow is not legally void. But ม.357/359 (expiry → a late payment is a
   *new offer*) and ม.366 (unagreed essential terms → in doubt, no contract) mean the quotation must carry an
   **expiry** and must **state every essential term**, and the exact priced document shown at payment must be
   **snapshotted immutably** so the contract's content is provable.
4. **ISO/IEC 17065 wants an enforceable agreement and fee transparency — and it has exactly one timing gate,
   at certificate issuance (7.7.3(c)), not at evaluation start.** An accepted quotation satisfies this well but
   **is not itself named by the standard**; do not over-claim it as an ISO requirement.
5. **Stripe imposes nothing here.** Its Quotes `accept` state is a merchant-side record behind a paid plan, and
   Checkout has no acceptance step at all. If acceptance needs to be captured at payment time, `consent_collection`
   on the Checkout Session is the Stripe-native hook — opt-in, off by default.

## Everything marked UNVERIFIED in this report

- **CCC ม.354/356/357/359/360/361/366 exact wording** — cross-confirmed across three non-official sources;
  **not** verified against Krisdika/Ratchakitcha. deka.in.th returned 403; krisdika CCC text not opened.
- **ฎีกา 15238/2553** (purchase-order-matching-quotation = acceptance) — cited by a secondary source only;
  **judgment not read** (deka.in.th 403).
- **Whether ขมธอ. 3-2560 includes ใบเสนอราคา** as a defined electronic message type — standard PDF not opened;
  ETDA standards portal 301-redirects to a generic landing page. Search snippets conflict; **not resolved.**
- **Whether RD/ETDA anywhere prescribes an ordered chain quotation → PO → invoice → receipt** — no such guidance
  opened.
- **ISO/IEC 17065 clauses 4.6.1(b), 7.2, 7.7.3(c) exact wording** — from the **IAS accreditation-body checklist**
  reproducing the standard, not from ISO's own text (the official preview stops at page 6, mid-4.2.8). Clause
  **4.1.2.1/4.1.2.2 only** are quoted from the official ISO preview.
- **IAF guidance on fees / fee agreement before service** — **not found and not opened.** No claim either way.
- **Stripe customer-facing hosted quote acceptance or e-signature** — searched, **not found and not opened.**
- **`terms_of_service_acceptance` prose** — the Checkout "collect additional information" page is a link index
  and does not contain it; only the `consent_collection` / `consent` field definitions from the API reference
  are verified.
- **Revenue Department seminar PDF** (`180820_eTaxInvoice-eReceipt_doc.pdf`) — downloaded but Thai glyphs did
  not extract; **not used as a quotable source.**
- **peesirilaw.com** — fetched and **discarded**: it returned demonstrably wrong text (loan/bailment law) for
  the contract-formation sections. Recorded here as a known-bad source for this topic.
