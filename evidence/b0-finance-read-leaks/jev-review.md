# Jev second opinion (order 53) on 5828c0b0e..3cb2fe5fa

Call: openai/gpt-6.1-sol via jev-router, 2026-10-09T16:20+07:00, 396,394 payload chars, US$0.39 (calls.jsonl). Payload: source diff + files, every 13-digit run masked.

## Verdicts after checking each finding against the code

1. HIGH, uploader-owns-file before the organization check (canSeeDraftDoc). NOT ACTED ON IN B0. The function is unchanged by this branch (git blame: 1a86f3633c, 2026-07-06). The uploader of a draft document is its owner by design ("owner by UUID"); the scenario needs one user id to move from applicant to staff in another organization. Reported to the coordinator as a pre-existing question, outside B0.

2. MEDIUM, the quotation PDF prints one instalment's amount as its grand total. VERIFIED, PRE-EXISTING, NOT FIXED IN B0. services/pdf/invoice-template-service.js sets grandTotal = phaseTotal for the requested phase (default 1), so one quotation number renders 5,885 or 29,425, never the full price. Order 54 says the quotation states the full amount of both instalments. This branch did not touch that logic (its only edit there removed the upload option). Reported to the coordinator for a tracked fix (money-document content, Tier C, its own branch).

## Raw response

## 1. HIGH — Upload ownership bypasses staff organization scoping

**Location:** `apps/backend/middleware/uploads-access.js:196–205, 256–270, 312–318`

**Defect:** The upload ACL accepts an uploader-ID match before checking organization scope, allowing staff to read documents outside their current organization, contrary to order 17.

**Failure scenario:** An `applicationDocument` references a private draft document uploaded by user U, and its application belongs to organization A. U is now a staff account in organization B—for example, after changing organizations—but retains the same user ID. U requests `/uploads/application-drafts/<stored-file>`. The document lookup returns U as `ownerUserId` and A as `organizationId`; `canSeeDraftDoc` immediately returns `true` at line 199, never evaluating the organization check. The object-access middleware consequently permits the document to be served to staff from the wrong organization. The same shortcut also ignores a missing staff organization.

## 2. MEDIUM — Quotation PDFs still state only one instalment’s amount

**Location:** `apps/backend/routes/api/applications/quotations.js:376–383`; `apps/backend/services/pdf/invoice-template-service.js:1233–1240, 1312, 1337–1339, 1371`

**Defect:** The quotation renderer uses the selected instalment’s amount as the quotation’s grand total instead of the full two-instalment price required by order 54.

**Failure scenario:** A stored quotation contains M1 of THB 5,885 and M2 of THB 29,425, totaling THB 35,310. An authorized caller requests its quotation PDF without a `phase` parameter. The route selects phase 1, and the renderer sets `GRAND_TOTAL` to THB 5,885 under the stored quotation number. Requesting `?phase=2` instead supplies THB 29,425 under that same number. Thus, two different partial totals are rendered as the same numbered quotation, rather than a quotation stating the full agreed THB 35,310.