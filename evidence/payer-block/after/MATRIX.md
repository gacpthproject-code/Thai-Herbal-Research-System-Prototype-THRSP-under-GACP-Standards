# Payer-block matrix — 2026-09-27 (fix/payer-block-by-type)

Real render, scratch Postgres (127.0.0.1:5434), run tag `mvqvo5yd544d`. IDs masked to last-4.

| doc | type | verdict | actual | expected |
|---|---|---|---|---|
| invoice | INDIVIDUAL | PASS | name-label="ชื่อ-นามสกุล / Name" name="สมชาย นามสมมติทดสอบ" id-label="เลขประจำตัวประชาชน / ID No." id="-" | name-label contains "ชื่อ-นามสกุล"; NO national ID anywhere |
| receipt-tax-invoice | INDIVIDUAL | PASS | name-label="ชื่อ-นามสกุล / Name" name="สมชาย นามสมมติทดสอบ" tax-id="-" | name-label contains "ชื่อ-นามสกุล"; NO national ID anywhere |
| invoice | JURISTIC | PASS | name-label="ชื่อบริษัท / Company Name" name="บริษัท ทดสอบตรวจสอบ จำกัด" id-label="เลขประจำตัวผู้เสียภาษี / Tax ID" id="…0004" | name-label "ชื่อบริษัท"; id = Entity.juristicId (…0004) |
| receipt-tax-invoice | JURISTIC | PASS | name-label="ชื่อบริษัท / Company Name" name="บริษัท ทดสอบตรวจสอบ จำกัด" tax-id="…00-4" | tax-id = Entity.juristicId, 1-4-5-2-1 (0-1050-00000-00-4) |
| invoice | COMMUNITY_ENTERPRISE | PASS | name-label="ชื่อวิสาหกิจชุมชน / Community Enterprise Name" name="วิสาหกิจชุมชนทดสอบตรวจสอบ" id-label="เลขทะเบียนวิสาหกิจชุมชน / Registration No." id="…5678" | name-label "ชื่อวิสาหกิจชุมชน"; id = Entity.communityRegNo (…5678) |
| receipt-tax-invoice | COMMUNITY_ENTERPRISE | PASS | name-label="ชื่อวิสาหกิจชุมชน / Community Enterprise Name" name="วิสาหกิจชุมชนทดสอบตรวจสอบ" tax-id="-" | tax-id = "-" (community enterprise has no tax-id field on a tax invoice) |
| credit-note | INDIVIDUAL | PASS | name-printed=true id-matches-entity=true | name=สมชาย นามสมมติทดสอบ; id=NO national ID anywhere |
| debit-note | INDIVIDUAL | PASS | name-printed=true id-matches-entity=true | name=Entity.displayName; id=NO national ID anywhere |
| credit-note | JURISTIC | PASS | name-printed=true id-matches-entity=true | name=บริษัท ทดสอบตรวจสอบ จำกัด; id=Entity.juristicId in Thai digits, 1-4-5-2-1 (๐-๑๐๕๐-๐๐๐๐๐-๐๐-๔) |
| debit-note | JURISTIC | PASS | name-printed=true id-matches-entity=true | name=Entity.displayName; id=Entity.juristicId in Thai digits, 1-4-5-2-1 (๐-๑๐๕๐-๐๐๐๐๐-๐๐-๔) |
| credit-note | COMMUNITY_ENTERPRISE | PASS | name-printed=true id-matches-entity=true | name=วิสาหกิจชุมชนทดสอบตรวจสอบ; id=Entity.communityRegNo in Thai digits (๕๘๐๑๒๓๔๕๖๗๘) |
| debit-note | COMMUNITY_ENTERPRISE | PASS | name-printed=true id-matches-entity=true | name=Entity.displayName; id=Entity.communityRegNo in Thai digits (๕๘๐๑๒๓๔๕๖๗๘) |
| quotation | INDIVIDUAL | PASS | name-ok=true id-ok=true prints-"บริษัท"=false prints-holder-phone(0001)=true | name=Entity.displayName; id=NO national ID anywhere; "บริษัท" only for JURISTIC; phone=the holder record's contact phone |
| quotation | JURISTIC | PASS | name-ok=true id-ok=true prints-"บริษัท"=true prints-holder-phone(0002)=true | name=Entity.displayName; id=Entity.juristicId (…0004); "บริษัท" only for JURISTIC; phone=the holder record's contact phone |
| quotation | COMMUNITY_ENTERPRISE | PASS | name-ok=true id-ok=true prints-"บริษัท"=false prints-holder-phone(0003)=true | name=Entity.displayName; id=Entity.communityRegNo (…5678); "บริษัท" only for JURISTIC; phone=the holder record's contact phone |

Verdict counts: PASS=15 FAIL=0 BLOCKED=0 (of 15 cells)
