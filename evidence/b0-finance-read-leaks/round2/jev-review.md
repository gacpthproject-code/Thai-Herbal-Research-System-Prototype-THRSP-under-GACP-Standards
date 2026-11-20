# Jev second opinion on B0 round 2 (order 53)

Range 1b554df0c..44fdb9445, the nine round-2 source files: the uploads gate, the signed-URL door,
the credit-note and quotation routes, the credit-note, debit-note and books-access services, the
move script and the probe. Sent through `~/work/state/jev/review-branch.sh` with `JEV_PATHS`
naming those files, so error-codes.js (formatting and two pointers) stayed out of the payload.
Model openai/gpt-6.1-sol, 74,806 prompt tokens, 7,425 completion tokens, USD 0.26, 185 s.
Raw answer: `~/work/state/jev/reviews/fix-finance-read-leaks-r2-44fdb94/response.md`.

Each finding was checked against the code before anything was done with it.

| # | Jev | Checked | Action |
|---|---|---|---|
| 1 | HIGH: `canSeeDraftDoc` grants on the uploader id before any role or organization check, so a staff uploader who moved organization keeps reading the file | True. It is the security review's M4 (the uploads object ACL ignores membership and role), pre-existing, and the round-2 brief puts it on its own branch | None here. M4 stays tracked |
| 2 | MEDIUM: the move script resolved `--to` but not the folders under it; a `<to>/gacp-pdfs` symlink back into `uploads/lab-results` moves the receipts into a public folder and exits 0 | True, and it is this round's own code. Reproduced as a failing test (2ee5cdcbb): both a symlinked `<to>/gacp-pdfs` and a symlinked `<to>/gacp-pdfs/receipts` sent papers into `lab-results` with exit 0 | Fixed in 5ec04432a: `<to>/gacp-pdfs` and every per-file destination folder are compared by their real paths; 16/16 |
| 3 | MEDIUM: the debit note still accepts `reasonCode: 'LATE_FEE'`, which order 64 ค7 rules out | True (`services/debit-note-service.js:73-77`). The billing-reconciliation spec already assigns it to branch B6 ("เหตุ LATE_FEE ถูกปฏิเสธ", section 14) | None here. B6 carries it |
