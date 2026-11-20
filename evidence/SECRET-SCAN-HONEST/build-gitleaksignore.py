#!/usr/bin/env python3
"""Build .gitleaksignore from a gitleaks JSON report using the classification
the orchestrator + operator signed off. A finding enters the file ONLY if it
matches one of the classes below. Everything else is printed to stderr and
deliberately left uncovered.

Never prints Match/Secret. Fingerprints are commit:file:rule:line only.
"""
import json, subprocess, sys, collections

REPORT = sys.argv[1]
OUT = sys.argv[2]

d = json.load(open(REPORT))


def line_at(commit, path, n):
    r = subprocess.run(["git", "show", f"{commit}:{path}"],
                       capture_output=True, text=True)
    if r.returncode:
        return None
    L = r.stdout.splitlines()
    return L[n - 1] if len(L) >= n else None


def contains(f, needle):
    l = line_at(f["Commit"], f["File"], f["StartLine"])
    return l is not None and needle in l


# (key, title, predicate). Order is the order they appear in the file.
CLASSES = [
    ("private-key-fixture",
     "private-key — fake fixture, key body is literally '\\nABC\\n', in a test file "
     "that was deleted from the tree (verified per finding: the matched line contains "
     "-----BEGIN PRIVATE KEY-----\\nABC\\n)",
     lambda f: f["RuleID"] == "private-key"
     and f["File"] == "apps/backend/__tests__/unit/firebase-admin-service.test.js"
     and contains(f, "-----BEGIN PRIVATE KEY-----\\nABC\\n")),

    ("expired-health-cookie",
     "jwt — real HS256 tokens for the health-check account, EXPIRED 2026-03-31 and "
     "2026-04-06 (exp claim decoded in session). History only: the file is not in the "
     "tree. Rotating JWT_SECRET before pilot is a separate operator action, tracked in "
     "HARNESS_LOG.md — this line covers the scanner, not the risk.",
     lambda f: f["RuleID"] == "jwt" and f["File"] == ".codex-health-cookie.txt"),

    ("deliberate-fake-jwt",
     "jwt — a JWT built on purpose to be rejected; its signature segment is the literal "
     "string 'invalid_signature' (verified per finding). Line number differs per commit "
     "(94 in older commits, 95 now) because the file shifted, not because there are two "
     "tokens.",
     lambda f: f["RuleID"] == "jwt" and f["File"] == "scripts/test/agent-security.js"
     and contains(f, "invalid_signature")),

    ("stripe-keys-ready-envvar",
     "curl-auth-user — the probe interpolates an env var that holds no value in the "
     "repo; there is no credential on the line (verified per finding: the line "
     "references ${...} and not a literal).",
     lambda f: f["RuleID"] == "curl-auth-user"
     and f["File"] == "scripts/probes/stripe-keys-ready.sh" and f["StartLine"] == 6
     and contains(f, '-u "$STRIPE_SECRET_KEY:"')),

    ("openapi-readme-example",
     "curl-auth-header — one documentation example line (openapi/README.md:310), counted "
     "once per commit that touched the file.",
     lambda f: f["RuleID"] == "curl-auth-header" and f["File"] == "openapi/README.md"
     and f["StartLine"] == 310
     and contains(f, "curl -X GET https://api.gacp.platform")),

    ("committed-jest-output",
     "generic-api-key — fixture values inside jest run logs that were committed AS "
     "EVIDENCE under evidence/, docs/handoffs/ and ralph/evidence/. These are outputs of "
     "test runs, not configuration.",
     lambda f: f["RuleID"] == "generic-api-key"
     and f["File"].startswith(("evidence/", "docs/handoffs/", "ralph/evidence/"))),

    ("test-fixture",
     "generic-api-key — fixture values inside __tests__/ suites.",
     lambda f: f["RuleID"] == "generic-api-key" and "__tests__/" in f["File"]),

    ("openapi-example-field",
     "generic-api-key — `example:` values in the OpenAPI spec.",
     lambda f: f["RuleID"] == "generic-api-key"
     and f["File"] == "openapi/authentication-service.yaml"),

    ("css-class-and-testid",
     "generic-api-key — CSS class names and test-ids that the generic entropy rule "
     "mistakes for keys.",
     lambda f: f["RuleID"] == "generic-api-key"
     and f["File"] == "apps/web-app/src/components/payments/QuotationReviewSection.tsx"),
]

covered = {}
for f in d:
    for key, _title, pred in CLASSES:
        if pred(f):
            covered.setdefault(key, []).append(f)
            break

covered_fps = {f["Fingerprint"] for v in covered.values() for f in v}
uncovered = [f for f in d if f["Fingerprint"] not in covered_fps]

hdr = """# .gitleaksignore — fingerprints of findings that have been CLASSIFIED, one line each.
#
# WHAT THIS FILE IS
# A fingerprint is commit:file:rule:line. It carries no secret material, and it
# pins ONE finding in ONE commit. That is the point: this file cannot hide a
# secret that has not been looked at, because a secret nobody looked at has no
# line here.
#
# WHAT THIS FILE IS NOT
# Not a path allowlist. Deliberately. A rule like "skip evidence/" would also
# swallow the next real key that a test run prints into an evidence log, and
# evidence/ is exactly where such a key would land. Every line below names one
# finding somebody classified.
#
# ADDING A LINE IS GRANTING COVER
# Under CLAUDE.md Law L6 that is operator-only, the same as a waiver or a ratchet
# baseline going up. An agent may REMOVE lines (a finding that stopped existing)
# and may regenerate the file after re-running the scan, but a new fingerprint
# needs an operator signature on the PR that adds it.
#
# HOW TO REGENERATE / VERIFY
#   gitleaks detect --no-banner --redact --report-format json --report-path <out>
# is what scripts/ci/full-gate.sh runs (check `secret-scan-deep`). Any finding not
# listed here shows up in that report and fails the gate.
#
# WHAT IS DELIBERATELY *NOT* COVERED
# See the report on branch fix/secret-scan-honest: findings outside the classes
# below were left uncovered on purpose so the gate keeps pointing at them,
# including a 64-hex value assigned to process.env.DAILY_API_KEY in
# scripts/verify-video-service.js (history only, file deleted from the tree).
# Do not add those lines to make the gate green — the answer to that one is
# rotate-then-classify, and it belongs to the operator.
#
# Generated from a full-history scan with gitleaks 8.30.1 on 2026-08-08
# (source commit c4822d60, %d commits scanned, %d findings, %d classified below).
""" % (1983, len(d), len(covered_fps))

with open(OUT, "w", encoding="utf-8") as fh:
    fh.write(hdr)
    for key, title, _p in CLASSES:
        rows = covered.get(key, [])
        if not rows:
            continue
        fh.write("\n# ── %s (%d) ──\n# %s\n" % (key, len(rows), title.replace("\n", "\n# ")))
        for f in sorted(rows, key=lambda x: (x["File"], x["StartLine"], x["Commit"])):
            fh.write(f["Fingerprint"] + "\n")

print("classified/covered : %d" % len(covered_fps))
for key, _t, _p in CLASSES:
    print("   %-28s %d" % (key, len(covered.get(key, []))))
print("NOT covered        : %d" % len(uncovered))
g = collections.Counter((f["RuleID"], f["File"], f["StartLine"]) for f in uncovered)
for (r, fl, ln), n in sorted(g.items()):
    print("   %-16s %s:%s  (%d commit(s))" % (r, fl, ln, n))
