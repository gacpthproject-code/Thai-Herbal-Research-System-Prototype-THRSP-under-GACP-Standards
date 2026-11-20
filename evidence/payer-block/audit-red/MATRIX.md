# Payer-block RED matrix — 2026-09-27 (fix/payer-block-by-type, pre-fix)

Real render, scratch Postgres (127.0.0.1:5434), run tag `mujvqbt7dbf0`. IDs masked to last-4.

| doc | type | verdict | actual | expected |
|---|---|---|---|---|
| invoice | INDIVIDUAL | PASS | name-label="ชื่อ-นามสกุล / Name" name="สมชาย นามสมมติทดสอบ" id-label="เลขประจำตัวประชาชน / ID No." id="-" | name-label contains "ชื่อ-นามสกุล"; NO national ID anywhere |
| receipt | INDIVIDUAL | PASS | name-label="ชื่อ-นามสกุล / Name" name="สมชาย นามสมมติทดสอบ" id-label="เลขประจำตัว / ID No." id="-" | name-label contains "ชื่อ-นามสกุล"; NO national ID anywhere |
| tax-invoice | INDIVIDUAL | PASS | name="สมชาย นามสมมติทดสอบ" tax-id="-" | NO national ID anywhere |
| invoice | JURISTIC | FAIL | name-label="ชื่อบริษัท / Company Name" name="บริษัท ทดสอบตรวจสอบ จำกัด" id-label="เลขประจำตัวผู้เสียภาษี / Tax ID" id="-" | name-label "ชื่อบริษัท"; id = Entity.juristicId (…0004) |
| receipt | JURISTIC | FAIL | name-label="ชื่อบริษัท / Company Name" name="บริษัท ทดสอบตรวจสอบ จำกัด" id-label="เลขประจำตัวผู้เสียภาษี / Tax ID" id="-" | id = Entity.juristicId (…0004) |
| tax-invoice | JURISTIC | FAIL | name="บริษัท ทดสอบตรวจสอบ จำกัด" tax-id="-" | tax-id = Entity.juristicId (…0004) |
| invoice | COMMUNITY_ENTERPRISE | FAIL | name-label="ชื่อ-นามสกุล / Name" name="วิสาหกิจชุมชนทดสอบตรวจสอบ" id-label="เลขประจำตัวประชาชน / ID No." id="-" | name-label "ชื่อวิสาหกิจชุมชน"; id = Entity.communityRegNo (…5678) |
| receipt | COMMUNITY_ENTERPRISE | FAIL | name-label="ชื่อ-นามสกุล / Name" name="วิสาหกิจชุมชนทดสอบตรวจสอบ" id-label="เลขประจำตัว / ID No." id="-" | id = Entity.communityRegNo (…5678) |
| tax-invoice | COMMUNITY_ENTERPRISE | PASS | name="วิสาหกิจชุมชนทดสอบตรวจสอบ" tax-id="-" | tax-id = "-" (per approved target, community on tax invoice) |
| credit-note | INDIVIDUAL | FAIL | name-printed=false (billingName snapshot) id-matches-entity=true | name=สมชาย นามสมมติทดสอบ; id=NO national ID anywhere |
| debit-note | INDIVIDUAL | FAIL | name-printed=false (billingName snapshot) id-matches-entity=true | name=Entity.displayName; id=NO national ID anywhere |
| credit-note | JURISTIC | FAIL | name-printed=false (billingName snapshot) id-matches-entity=false | name=บริษัท ทดสอบตรวจสอบ จำกัด; id=Entity.juristicId (…0004) |
| debit-note | JURISTIC | FAIL | name-printed=false (billingName snapshot) id-matches-entity=false | name=Entity.displayName; id=Entity.juristicId (…0004) |
| credit-note | COMMUNITY_ENTERPRISE | FAIL | name-printed=false (billingName snapshot) id-matches-entity=false | name=วิสาหกิจชุมชนทดสอบตรวจสอบ; id=Entity.communityRegNo (…5678) |
| debit-note | COMMUNITY_ENTERPRISE | FAIL | name-printed=false (billingName snapshot) id-matches-entity=false | name=Entity.displayName; id=Entity.communityRegNo (…5678) |
| quotation | INDIVIDUAL | FAIL | name-ok=true id-ok=false prints-"บริษัท"=true prints-wizard-phone(0001)=false | name=Entity.displayName; id=NO national ID anywhere; "บริษัท" only for JURISTIC; phone=applicantData.phone |
| quotation | JURISTIC | FAIL | name-ok=false id-ok=false prints-"บริษัท"=true prints-wizard-phone(0002)=false | name=Entity.displayName; id=Entity.juristicId (…0004); "บริษัท" only for JURISTIC; phone=applicantData.phone |
| quotation | COMMUNITY_ENTERPRISE | FAIL | name-ok=false id-ok=false prints-"บริษัท"=true prints-wizard-phone(0003)=false | name=Entity.displayName; id=Entity.communityRegNo (…5678); "บริษัท" only for JURISTIC; phone=applicantData.phone |

Verdict counts: PASS=4 FAIL=14 BLOCKED=0 (of 18 cells)

## Web row (derived by reading code — apps/web-app has no jest/RTL setup for
## this component; invoice-step.tsx feeds quotation-document.tsx from raw
## `state.applicantData`, independently of the backend resolver above)

| doc | type | verdict | actual (from source) | expected |
|---|---|---|---|---|
| web quotation | INDIVIDUAL | FAIL | `applicantTaxId = taxId ‖ idCard` (invoice-step.tsx:255-258), unconditional; idCard = the national ID → printed under "เลขประจำตัวผู้เสียภาษี" | NO national ID anywhere |
| web quotation | JURISTIC | PASS | `applicantTaxId = taxId` — key matches wizard's own `taxId` (step2-identity-config.ts:61) | shows Entity-equivalent id |
| web quotation | COMMUNITY_ENTERPRISE | FAIL | `applicantTaxId` never reads `communityRegistrationNo` (the real wizard key) — id never shown at all | shows Entity.communityRegNo |

## Defect id cross-reference (AUDIT_LEDGER.md, append-only below)
L-081 invoice/receipt entity-select gap · L-082 tax-invoice wrong source ·
L-083 credit/debit-note hardcoded "-" id + unpopulated billingName ·
L-084 backend quotation leaks INDIVIDUAL national ID (CRITICAL) ·
L-085 quotation route has no `entity` in its select at all ·
L-086 legacy resolver's community key names don't match the wizard's ·
L-087 quotation.html hardcodes "บริษัท" for every type ·
L-088 quotation CUSTOMER_PHONE reads the wrong formData key ·
L-089 web quotation leaks INDIVIDUAL national ID (CRITICAL) ·
L-090 web duplicates the backend's type-resolution logic, disagreeing ·
L-091 quotation-document.tsx hardcoded signatory name/position ·
L-092 payerNameLabel has no COMMUNITY_ENTERPRISE branch
