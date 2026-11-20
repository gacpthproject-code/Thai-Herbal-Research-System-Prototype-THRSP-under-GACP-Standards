#!/usr/bin/env bash
# rejected-approver-only — คำสั่ง 56(2): ไม่ให้การรับรอง (REJECTED) เป็นของผู้อนุมัติใบรับรองคนเดียว
#
# สิ่งที่ด่านนี้มองไม่เห็น (บอกตรง ๆ): ประตูผู้ดูแลทั้งสี่ส่งปลายทางเป็นตัวแปร ค่าที่ประกอบจากตัวแปร
# seed นอกโฟลเดอร์ที่สแกน และ SQL ดิบ · ที่กันจริงคือด่านในตัวเขียนสถานะและเทสต์ Postgres จริง
# (__tests__/integration/admin-doors-around-the-certification-decision-real-postgres.test.js)
#
# ใช้:  bash scripts/probes/rejected-approver-only.sh
#       bash scripts/probes/rejected-approver-only.sh --selftest
#       REJECTED_SCAN_ROOT=<dir> REJECTED_EDGES_FIXTURE=<json> bash scripts/probes/rejected-approver-only.sh
#         ^ ต้นไม้และตารางสังเคราะห์ เพื่อออกกำลังด่านกับคำตอบที่รู้อยู่แล้ว
source "$(dirname "$0")/_lib.sh"

ALLOWED_WRITERS="services/certification-decision-service.js"

# พิมพ์ไฟล์ที่เขียน REJECTED (หนึ่งบรรทัดต่อไฟล์) ในต้นไม้ที่ให้มา
rejected_writers() {
    local root="$1" dirs=()
    for d in routes services controllers jobs; do
        [ -d "$root/$d" ] && dirs+=("$root/$d")
    done
    [ ${#dirs[@]} -eq 0 ] && return 0
    grep -rlE "REJECTED" "${dirs[@]}" --include='*.js' 2>/dev/null | while IFS= read -r f; do
        awk '
            /data[[:space:]]*:/  { mark = "data" }
            /where[[:space:]]*:/ { mark = "where" }
            /(toStatus|toState)[[:space:]]*:[[:space:]]*.REJECTED./ { print FILENAME; exit }
            /nextStatus[[:space:]]*=[[:space:]]*.REJECTED./ { print FILENAME; exit }
            /APPLICATION_STATUSES\.REJECTED/ { print FILENAME; exit }
            /data[[:space:]]*:.*status[[:space:]]*:[[:space:]]*.REJECTED./ { print FILENAME; exit }
            /status[[:space:]]*:[[:space:]]*.REJECTED./ { if (mark == "data") { print FILENAME; exit } }
        ' "$f"
    done
}

# ด่านที่สอง: พิมพ์ข้อละบรรทัดสำหรับขาที่ผิดกติกา (ว่าง = ผ่าน)
edge_violations() {
    node -e '
        const fixture = process.env.REJECTED_EDGES_FIXTURE;
        let table;
        if (fixture) {
            table = JSON.parse(require("fs").readFileSync(fixture, "utf8"));
        } else {
            const backend = process.argv[1];
            const wf = require(`${backend}/services/workflow-transition-service`);
            const ds = require(`${backend}/shared/decision-states`);
            table = {
                roleTransitions: Object.fromEntries(Object.entries(wf.ROLE_TRANSITIONS).map(([r, s]) => [r, [...s]])),
                rejectedOwners: [...ds.DECISION_STATE_OWNERS.REJECTED],
            };
        }
        const allowedInto = {
            REJECTED: new Set(["certificate_approver:AUDIT_PASSED", "certificate_approver:AUDIT_NOT_PASSED"]),
        };
        const systemInto = { CAR_PENDING: new Set(["EXPIRED"]), AUDIT_PASSED: new Set() };
        const out = [];
        for (const [role, edges] of Object.entries(table.roleTransitions)) {
            for (const edge of edges) {
                const [from, to] = edge.split("->");
                if (to === "REJECTED" && !allowedInto.REJECTED.has(`${role}:${from}`)) { out.push(`edge ${role}:${edge}`); }
                if (role === "system" && systemInto[to] && !systemInto[to].has(from)) { out.push(`edge ${role}:${edge}`); }
            }
        }
        if (JSON.stringify(table.rejectedOwners) !== JSON.stringify(["certificate_approver"])) {
            out.push(`owners REJECTED=${JSON.stringify(table.rejectedOwners)}`);
        }
        process.stdout.write(out.join("\n"));
    ' "$BACKEND"
}

# ── selftest ──────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--selftest" ]; then
    TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT; BAD=0; CASES=0

    clean_edges() { # $1 file
        cat >"$1" <<'JSON'
{ "roleTransitions": {
    "certificate_approver": ["AUDIT_PASSED->REJECTED", "AUDIT_NOT_PASSED->REJECTED", "AUDIT_NOT_PASSED->CAR_PENDING"],
    "field_inspector": ["AUDIT_CONFIRMED->AUDIT_NOT_PASSED"],
    "system": ["EXPIRED->CAR_PENDING", "CAR_PENDING->EXPIRED"] },
  "rejectedOwners": ["certificate_approver"] }
JSON
    }
    make_tree() { # $1 dir
        mkdir -p "$1/services" "$1/routes" "$1/jobs" "$1/controllers"
        cat >"$1/services/certification-decision-service.js" <<'JS'
const refused = await writeDecision(tx, { application, toState: 'REJECTED', actor });
JS
        clean_edges "$1/edges.json"
    }
    check() { # $1 label  $2 dir  $3 expected-exit  [$4 needle]
        local out code
        CASES=$((CASES + 1))
        out="$(REJECTED_SCAN_ROOT="$2" REJECTED_EDGES_FIXTURE="$2/edges.json" bash "$0" 2>&1)"; code=$?
        if [ "$code" != "$3" ]; then
            echo "  ✗ $1 — คาด exit $3 ได้ $code"; echo "$out" | sed 's/^/      /'; BAD=1; return
        fi
        if [ -n "${4:-}" ] && ! printf '%s' "$out" | grep -q "$4"; then
            echo "  ✗ $1 — ไม่พบ \"$4\" ในผล"; echo "$out" | sed 's/^/      /'; BAD=1; return
        fi
        echo "  ✓ $1"
    }

    A="$TMP/a"; make_tree "$A"
    check "ต้นไม้สะอาด = PASS" "$A" 0 "PASS"

    B="$TMP/b"; make_tree "$B"
    echo "await writeApplicationStatus({ prisma: tx, toStatus: 'REJECTED' });" >"$B/routes/rogue.js"
    check "ไฟล์อื่นเขียน toStatus REJECTED = FAIL" "$B" 1 "rogue.js"

    C="$TMP/c"; make_tree "$C"
    echo "await writeApplicationStatus({ prisma, toStatus: APPLICATION_STATUSES.REJECTED });" >"$C/jobs/expire.js"
    check "ไฟล์อื่นเขียน APPLICATION_STATUSES.REJECTED = FAIL" "$C" 1 "expire.js"

    D="$TMP/d"; make_tree "$D"
    echo "const refused = await prisma.application.count({ where: { status: 'REJECTED' } });" >"$D/services/report.js"
    check "อ่าน where status REJECTED = PASS" "$D" 0 "PASS"

    E="$TMP/e"; make_tree "$E"
    printf "await prisma.application.update({\n    where: { id },\n    data: {\n        status: 'REJECTED',\n    },\n});\n" >"$E/controllers/sneaky.js"
    check "เขียนหลายบรรทัดใต้ data: = FAIL" "$E" 1 "sneaky.js"

    F="$TMP/f"; make_tree "$F"
    sed 's/"EXPIRED->CAR_PENDING"/"EXPIRED->CAR_PENDING", "AUDIT_CONFIRMED->REJECTED"/' "$F/edges.json" >"$F/e2" && mv "$F/e2" "$F/edges.json"
    check "ขา SYSTEM เข้า REJECTED จากสถานะอื่น = FAIL" "$F" 1 "system:AUDIT_CONFIRMED->REJECTED"

    G="$TMP/g"; make_tree "$G"
    sed 's/"EXPIRED->CAR_PENDING"/"EXPIRED->CAR_PENDING", "CAR_REVIEWING->AUDIT_PASSED"/' "$G/edges.json" >"$G/e2" && mv "$G/e2" "$G/edges.json"
    check "ขา SYSTEM เข้า AUDIT_PASSED นอกชุดที่อนุญาต = FAIL" "$G" 1 "system:CAR_REVIEWING->AUDIT_PASSED"

    H="$TMP/h"; make_tree "$H"
    sed 's/"field_inspector": \["AUDIT_CONFIRMED->AUDIT_NOT_PASSED"\]/"field_inspector": ["AUDIT_CONFIRMED->AUDIT_NOT_PASSED", "AUDIT_CONFIRMED->REJECTED"]/' "$H/edges.json" >"$H/e2" && mv "$H/e2" "$H/edges.json"
    check "ขาเดิมของผู้ตรวจพื้นที่กลับมา = FAIL" "$H" 1 "field_inspector:AUDIT_CONFIRMED->REJECTED"

    I="$TMP/i"; make_tree "$I"
    sed 's/"EXPIRED->CAR_PENDING"/"EXPIRED->CAR_PENDING", "APPEAL_REVIEWING->REJECTED"/' "$I/edges.json" >"$I/e2" && mv "$I/e2" "$I/edges.json"
    check "ขาอุทธรณ์ของ SYSTEM เข้า REJECTED ก่อนหน่วยที่สร้างการอุทธรณ์ = FAIL" "$I" 1 "system:APPEAL_REVIEWING->REJECTED"

    J="$TMP/j"; make_tree "$J"
    echo "await writeApplicationStatus({ prisma, toStatus: 'REJECTED' });" >"$J/services/certification-appeal-service.js"
    check "ไฟล์อุทธรณ์ที่ยังไม่มีเจ้าของในหน่วยนี้เขียน REJECTED = FAIL" "$J" 1 "certification-appeal-service.js"

    echo "selftest: $CASES เคส"
    [ "$BAD" = 0 ] || exit 1
    echo "PASS: selftest ครบทั้งสองทิศ"
    exit 0
fi

SCAN="${REJECTED_SCAN_ROOT:-$BACKEND}"
HITS="$(rejected_writers "$SCAN" | sed "s#^$SCAN/##" | grep -vxF -f <(tr ' ' '\n' <<<"$ALLOWED_WRITERS") || true)"
[ -n "$HITS" ] && fail "REJECTED written outside the certificate approver's service: $(printf '%s' "$HITS" | tr '\n' ' ')"

EDGES="$(edge_violations)" || fail "could not load the workflow tables"
[ -n "$EDGES" ] && fail "REJECTED or SYSTEM decision edges outside the allowed set: $(printf '%s' "$EDGES" | tr '\n' ' ')"

pass "only the certificate approver writes REJECTED; ROLE_TRANSITIONS and DECISION_STATE_OWNERS agree"
