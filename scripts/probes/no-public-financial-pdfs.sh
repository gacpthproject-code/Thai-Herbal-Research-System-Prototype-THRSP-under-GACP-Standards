#!/usr/bin/env bash
# no-public-financial-pdfs — a generated finance paper is never under a public /uploads path.
#
# Billing-reconciliation spec 14.4 (B0). On 2026-10-09 staging served
# /uploads/gacp-pdfs/receipts-null.pdf to anyone: the PDF renderer copied every receipt,
# invoice, quotation and credit/debit note into the `gacp-pdfs` storage bucket, local storage
# keeps that under the static /uploads mount, and the classifier called the folder public.
#
#   1. writer          no backend source outside the tests writes to the `gacp-pdfs` bucket.
#                      Matched on code shapes (BUCKETS.pdfs, a `pdfs: 'gacp-pdfs'` bucket entry,
#                      an uploadBuffer('gacp-pdfs', …) call), never on a mention: a comment
#                      that explains the removal must not trip it.
#   2. classification  middleware/uploads-classification.js calls every gacp-pdfs/ path
#                      sensitive, so the static mount answers 401 or 404 for it.
#   3. disk            only when PROBE_UPLOADS_DIR is set (a deploy check on a host). Reads the
#                      whole uploads root, following symlinks (find -L), and fails on any file
#                      left under gacp-pdfs/ and on any finance-paper name in a folder the
#                      classifier calls public. Prints counts and folder names, never a file name.
#                      BLOCKED, never PASS, when the directory is missing or unreadable, holds
#                      none of an uploads root's folders, or has a folder this user cannot read.
#
# The uploads volume lives under /var/lib/docker, which only root reads, so the disk check runs
# as root with node on the PATH. On staging (another host names its own volume):
#   sudo env "PATH=$PATH" PROBE_UPLOADS_DIR=/var/lib/docker/volumes/gacp-platform_gacp_staging_uploads/_data \
#       bash scripts/probes/no-public-financial-pdfs.sh
# A PASS of the disk check says "read in full"; without PROBE_UPLOADS_DIR it says no disk was read.
#
# Contract: exit 0 PASS · 1 FAIL · 2 BLOCKED (node missing, or the disk cannot be read in full).
# Usage:  bash scripts/probes/no-public-financial-pdfs.sh
#         bash scripts/probes/no-public-financial-pdfs.sh --selftest
#         PROBE_UPLOADS_DIR=<uploads dir> bash scripts/probes/no-public-financial-pdfs.sh
#         NPFP_BACKEND_ROOT=<dir> bash scripts/probes/no-public-financial-pdfs.sh   (synthetic tree)
source "$(dirname "$0")/_lib.sh"

SCAN_BACKEND="${NPFP_BACKEND_ROOT:-$BACKEND}"

if [ "${1:-}" = "--selftest" ]; then
    TMP="$(mktemp -d)"; trap 'chmod -R u+rwx "$TMP" 2>/dev/null; rm -rf "$TMP"' EXIT; BAD=0; CASES=0

    classifier() { # $1 backend dir · $2 'sensitive' | 'public'
        mkdir -p "$1/middleware"
        local verdict='true'; [ "$2" = "public" ] && verdict='false'
        cat >"$1/middleware/uploads-classification.js" <<JS
'use strict';
function classifyUploadsPath(rel) {
    const generated = String(rel || '').startsWith('gacp-pdfs/');
    return { kind: generated ? 'generated' : 'public', sensitive: generated ? ${verdict} : false };
}
module.exports = { classifyUploadsPath };
JS
    }
    renderer() { # $1 backend dir · $2 body of services/pdf/renderer.js
        mkdir -p "$1/services/pdf"; printf '%s\n' "$2" >"$1/services/pdf/renderer.js"
    }
    check() { # $1 label · $2 backend dir · $3 expected exit · $4 needle · [$5 uploads dir]
        local code
        CASES=$((CASES + 1))
        OUT="$(NPFP_BACKEND_ROOT="$2" PROBE_UPLOADS_DIR="${5:-}" bash "$0" 2>&1)"; code=$?
        echo "--- selftest $1 → exit $code (expected $3)"; printf '%s\n' "$OUT"
        [ "$code" = "$3" ] || { echo "*** $1 FAILED: exit $code != $3"; BAD=$((BAD + 1)); }
        printf '%s' "$OUT" | grep -q -- "$4" || { echo "*** $1 FAILED: output does not mention '$4'"; BAD=$((BAD + 1)); }
        echo
    }
    disk() { # check, on a host folder: the names carry document numbers, so none may be printed
        check "$@"
        if printf '%s' "$OUT" | grep -q 'TAX-PRD'; then echo "*** $1 FAILED: printed a file name"; BAD=$((BAD + 1)); fi
    }
    uploads_root() { # $1 dir: an uploads root as a host holds one, with a public lab report and a draft
        mkdir -p "$1/lab-results" "$1/application-drafts"
        printf 'lab' >"$1/lab-results/1760000000000-0b6f5a7e.pdf"
        printf 'draft' >"$1/application-drafts/1760000000000-9c2d4e1f.pdf"
    }
    unreadable() { # $1 label · $2 backend dir · $3 dir to lock · $4 uploads dir
        if [ "$(id -u)" = 0 ]; then
            echo "--- selftest $1: NOT-RUN: root reads a mode-000 folder, so this case would assert nothing. Run the selftest as a non-root user."
            echo; return
        fi
        chmod 000 "$3"
        disk "$1" "$2" 2 'BLOCKED' "$4"
        chmod 700 "$3"
    }

    # A — sensitive classifier, a renderer that stores nothing ⇒ PASS.
    mkdir -p "$TMP/A"; classifier "$TMP/A" sensitive
    renderer "$TMP/A" "async function render(html) { return generatePDF(html); }"
    check A "$TMP/A" 0 'PASS'

    # B — the old writer comes back (BUCKETS.pdfs) ⇒ FAIL naming the file.
    mkdir -p "$TMP/B"; classifier "$TMP/B" sensitive
    renderer "$TMP/B" "await storageService.uploadBuffer(storageService.BUCKETS.pdfs, key, buffer, 'application/pdf');"
    check B "$TMP/B" 1 'services/pdf/renderer.js'

    # C — the bucket entry comes back ⇒ FAIL.
    mkdir -p "$TMP/C/services"; classifier "$TMP/C" sensitive
    printf '%s\n' "const BUCKETS = {" "    pdfs: 'gacp-pdfs'," "};" >"$TMP/C/services/storage-service.js"
    check C "$TMP/C" 1 'services/storage-service.js'

    # D — a literal bucket name in an upload call ⇒ FAIL.
    mkdir -p "$TMP/D"; classifier "$TMP/D" sensitive
    renderer "$TMP/D" "await uploadBuffer('gacp-pdfs', 'receipts/x.pdf', buffer);"
    check D "$TMP/D" 1 'services/pdf/renderer.js'

    # E — only comments mention the old writer ⇒ PASS (documentation never trips it).
    mkdir -p "$TMP/E"; classifier "$TMP/E" sensitive
    renderer "$TMP/E" "// The copy in BUCKETS.pdfs ('gacp-pdfs') was removed in B0.
 * uploadBuffer('gacp-pdfs', …) used to run here.
async function render(html) { return generatePDF(html); }"
    check E "$TMP/E" 0 'PASS'

    # F — the classifier calls gacp-pdfs public again ⇒ FAIL.
    mkdir -p "$TMP/F"; classifier "$TMP/F" public
    check F "$TMP/F" 1 'gacp-pdfs/receipts-'

    # G — the classifier is missing ⇒ FAIL, never a vacuous PASS.
    mkdir -p "$TMP/G/services"
    check G "$TMP/G" 1 'uploads-classification.js'

    # H — a paper left in the public folder of a host ⇒ FAIL with a count, no name.
    mkdir -p "$TMP/H" "$TMP/H-uploads/gacp-pdfs"; classifier "$TMP/H" sensitive
    printf 'pdf' >"$TMP/H-uploads/gacp-pdfs/receipts-TAX-PRD-2569-000001.pdf"
    disk H "$TMP/H" 1 '1 file' "$TMP/H-uploads"

    # I — the papers moved out of an uploads root that still holds a lab report and a draft ⇒ PASS.
    mkdir -p "$TMP/I" "$TMP/I-uploads/gacp-pdfs"; classifier "$TMP/I" sensitive; uploads_root "$TMP/I-uploads"
    disk I "$TMP/I" 0 'PASS' "$TMP/I-uploads"

    # J — PROBE_UPLOADS_DIR mistyped: no such directory ⇒ BLOCKED, never PASS.
    mkdir -p "$TMP/J"; classifier "$TMP/J" sensitive
    disk J "$TMP/J" 2 'BLOCKED' "$TMP/J-no-such-uploads"

    # K — the uploads root cannot be read (a docker volume read without root) ⇒ BLOCKED.
    mkdir -p "$TMP/K" "$TMP/K-uploads/gacp-pdfs"; classifier "$TMP/K" sensitive; uploads_root "$TMP/K-uploads"
    printf 'pdf' >"$TMP/K-uploads/gacp-pdfs/receipts-null.pdf"
    unreadable K "$TMP/K" "$TMP/K-uploads" "$TMP/K-uploads"

    # L — a readable directory that holds none of an uploads root's folders ⇒ BLOCKED.
    mkdir -p "$TMP/L" "$TMP/L-elsewhere/quarantine"; classifier "$TMP/L" sensitive
    disk L "$TMP/L" 2 'BLOCKED' "$TMP/L-elsewhere"

    # M — <uploads>/gacp-pdfs is a symlink to a folder that holds a paper ⇒ FAIL.
    mkdir -p "$TMP/M" "$TMP/M-elsewhere"; classifier "$TMP/M" sensitive; uploads_root "$TMP/M-uploads"
    printf 'pdf' >"$TMP/M-elsewhere/receipts-TAX-PRD-2569-000004.pdf"
    ln -s "$TMP/M-elsewhere" "$TMP/M-uploads/gacp-pdfs"
    disk M "$TMP/M" 1 '1 file' "$TMP/M-uploads"

    # N — papers in other folders the classifier calls public ⇒ FAIL naming the folders, never a file.
    mkdir -p "$TMP/N" "$TMP/N-uploads/gacp-uploads/receipts"; classifier "$TMP/N" sensitive; uploads_root "$TMP/N-uploads"
    printf 'pdf' >"$TMP/N-uploads/lab-results/receipts-TAX-PRD-2569-000002.pdf"
    printf 'pdf' >"$TMP/N-uploads/gacp-uploads/receipts/TAX-PRD-2569-000003.pdf"
    disk N "$TMP/N" 1 'lab-results: 1' "$TMP/N-uploads"
    printf '%s' "$OUT" | grep -q 'gacp-uploads: 1' || { echo "*** N FAILED: output does not count gacp-uploads"; BAD=$((BAD + 1)); }

    # O — one folder inside the uploads root cannot be read ⇒ BLOCKED: what it holds is unknown.
    mkdir -p "$TMP/O" "$TMP/O-uploads/gacp-uploads"; classifier "$TMP/O" sensitive; uploads_root "$TMP/O-uploads"
    printf 'pdf' >"$TMP/O-uploads/gacp-uploads/receipts-TAX-PRD-2569-000005.pdf"
    unreadable O "$TMP/O" "$TMP/O-uploads/gacp-uploads" "$TMP/O-uploads"

    echo "selftest: $CASES cases, $BAD failure(s)"
    [ "$BAD" = 0 ] && exit 0 || exit 1
fi

command -v node >/dev/null 2>&1 || blocked "node is not installed — the classification check cannot run"

WRITERS="$(grep -rnE "BUCKETS\.pdfs|pdfs[[:space:]]*:[[:space:]]*['\"]gacp-pdfs['\"]|uploadBuffer\([[:space:]]*['\"]gacp-pdfs['\"]" \
    "$SCAN_BACKEND" --include='*.js' --exclude-dir=node_modules --exclude-dir=__tests__ 2>/dev/null \
    | grep -vE "^[^:]+:[0-9]+:[[:space:]]*(//|\*|/\*)" || true)"
if [ -n "$WRITERS" ]; then
    fail "a writer into the gacp-pdfs bucket is back: $(printf '%s\n' "$WRITERS" | cut -d: -f1,2 | sed "s#^$SCAN_BACKEND/##" | tr '\n' ' ')"
fi

CLASSIFIER="$SCAN_BACKEND/middleware/uploads-classification.js"
[ -f "$CLASSIFIER" ] || fail "middleware/uploads-classification.js is missing — nothing decides that gacp-pdfs/ is sensitive"
PUBLIC_PATHS="$(node -e '
const { classifyUploadsPath } = require(process.argv[1]);
const samples = ["receipts-TAX-PRD-2569-000001.pdf", "receipts-null.pdf", "invoices-INV-CO-1A2B3C4D-M1.pdf",
    "quotations-QT-2569-000001.pdf", "credit-notes-CN-PRD-2569-000001.pdf", "debit-notes-DN-PRD-2569-000001.pdf",
    "labels-LOT-1.pdf", "receipts/TAX-PRD-2569-000001.pdf"].map((name) => `gacp-pdfs/${name}`);
console.log(samples.filter((p) => !classifyUploadsPath(p).sensitive).join(" "));
' "$CLASSIFIER" 2>&1)" || fail "the classifier did not load: $PUBLIC_PATHS"
[ -z "$PUBLIC_PATHS" ] || fail "classified public: $PUBLIC_PATHS"

# The top-level folders an uploads root holds: the classifier's sensitive prefixes, the local
# storage buckets (services/storage-service.js BUCKETS) and the lab-report uploader.
UPLOADS_FOLDERS='application-drafts wizard-drafts slips car audits lab-results gacp-pdfs gacp-uploads gacp-certificates'

# Reads NUL-separated paths relative to the uploads root on stdin; prints one verdict line.
DISK_SCAN_JS='
const { classifyUploadsPath } = require(process.argv[1]);
const KINDS = ["receipts", "invoices", "quotations", "credit-notes", "debit-notes"];
const NUMBER = /^(TAX|INV|QT|CN|DN)-/i;
const looksLikePaper = (rel) => {
    const segments = rel.toLowerCase().split("/");
    const base = segments.pop();
    return segments.some((s) => KINDS.includes(s)) || KINDS.some((k) => base.startsWith(`${k}-`)) || NUMBER.test(base);
};
const rels = require("fs").readFileSync(0, "utf8").split("\0").filter(Boolean).map((p) => p.replace(/^\.\//, ""));
let generated = 0;
const papers = {};
for (const rel of rels) {
    if (rel.startsWith("gacp-pdfs/")) { generated += 1; continue; }
    if (classifyUploadsPath(rel).sensitive || !looksLikePaper(rel)) { continue; }
    const folder = rel.includes("/") ? rel.split("/")[0] : "<root>";
    papers[folder] = (papers[folder] || 0) + 1;
}
const inPublic = Object.values(papers).reduce((a, b) => a + b, 0);
if (generated === 0 && inPublic === 0) {
    console.log(`CLEAN the uploads root read in full (${rels.length} file(s)): nothing under gacp-pdfs, no finance paper in a public folder`);
} else {
    const where = Object.entries(papers).map(([f, n]) => `${f}: ${n}`).join(", ");
    console.log(`PAPERS ${generated} file(s) still under <uploads>/gacp-pdfs`
        + (generated ? " (move them: apps/backend/scripts/ops/move-generated-pdfs-out-of-public.js --apply)" : "")
        + ` · ${inPublic} finance paper(s) in public folders` + (inPublic ? ` (${where}): find their writer` : ""));
}
'

if [ -n "${PROBE_UPLOADS_DIR:-}" ]; then
    UPLOADS="$PROBE_UPLOADS_DIR"
    { [ -d "$UPLOADS" ] && [ -r "$UPLOADS" ] && [ -x "$UPLOADS" ]; } \
        || blocked "PROBE_UPLOADS_DIR is not a directory this user can read (mistyped, not mounted, or root-only like a docker volume): run the disk check as root, see the header"
    FOUND=0
    for folder in $UPLOADS_FOLDERS; do [ -d "$UPLOADS/$folder" ] && FOUND=1; done
    [ "$FOUND" = 1 ] || blocked "PROBE_UPLOADS_DIR holds none of an uploads root's folders ($UPLOADS_FOLDERS): is it the uploads volume?"
    LISTING="$(mktemp)"; trap 'rm -f "$LISTING"' EXIT
    # find's own messages name paths, so they are dropped; its exit status says whether it read everything.
    (cd "$UPLOADS" && find -L . -type f -print0) >"$LISTING" 2>/dev/null \
        || blocked "find could not read every folder under PROBE_UPLOADS_DIR: run the disk check as root, see the header"
    VERDICT="$(node -e "$DISK_SCAN_JS" "$CLASSIFIER" <"$LISTING" 2>&1)" || fail "the disk scan did not run: $VERDICT"
    case "$VERDICT" in
        CLEAN\ *)  pass "no writer, gacp-pdfs/ classified sensitive, and ${VERDICT#CLEAN }" ;;
        PAPERS\ *) fail "${VERDICT#PAPERS }" ;;
        *)         fail "the disk scan answered nothing usable: $VERDICT" ;;
    esac
fi
pass "no writer into the gacp-pdfs bucket, and gacp-pdfs/ is classified sensitive (no host disk read: PROBE_UPLOADS_DIR is unset)"
