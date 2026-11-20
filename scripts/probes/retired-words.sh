#!/usr/bin/env bash
# retired-words — คำที่มติ operator ยกเลิกแล้ว ต้องไม่ถูก "สอน" อยู่ในพื้นผิวคำสั่ง
#
# พื้นผิวคำสั่ง = ไฟล์ที่ agent อ่านแล้วลงมือทำตาม · คำเก่าในนั้นคือเหตุที่งานสร้างใหม่
# ไหลกลับไปหาของที่ถูกถอด (memory slip-and-account-approve-retired: "กลับมาที่สลิปตลอด
# คาดว่าไปอ่านเจอ") · ตัวตรวจคำเก่าที่มีอยู่ (eslint no-legacy-status-vocabulary) อ่านแค่ apps/
#
# ไม่อ่าน (พิมพ์ทุกครั้ง): apps/ (มี eslint ของตัวเอง) · docs/ (บันทึกลงวันที่ ต้องใช้กติกาป้าย
# เลิกใช้ — งานถัดไป) · scripts/ · evidence/ · reports/
#
# บรรทัดที่บรรยายการยกเลิก ผ่าน — หลักเดียวกับ no-skip: การอธิบายว่าอะไรถูกถอดคือเอกสาร
# (NARRATION แคบเฉพาะคำที่บอกว่า "สิ่งนี้เลิกแล้ว" — ยกเลิก เดี่ยว ๆ แปลว่า cancel ก็ได้
# เช่น "กดยกเลิกคำขอ" ไม่ใช่คำบรรยายการถอดฟีเจอร์ ต้องไม่ตัดสิทธิ์บรรทัดนั้น)
#
# ทุกแถวใน retired-words.txt ต้องมีตัวคั่น " | " (เว้นวรรค-ไปป์-เว้นวรรค) พอดี 3 ที่ = 4 ฟิลด์
# — ไปป์ของ regex เอง (alternation) ต้องไม่มีเว้นวรรคคร่อม ไม่งั้นถูกนับเป็นตัวคั่นผิดแถว
# ใช้:  bash scripts/probes/retired-words.sh [--selftest]
source "$(dirname "$0")/_lib.sh"
DATA="${RETIRED_WORDS_FILE:-$(cd "$(dirname "$0")" && pwd)/retired-words.txt}"
SCAN_ROOT="${RETIRED_WORDS_ROOT:-$ROOT}"
SURFACE=(CLAUDE.md HARNESS.md .claude/skills .claude/agents .claude/commands)
NARRATION='ถูกถอด|ถอดออก|เลิกใช้|ถูกยกเลิก|ยกเลิกแล้ว|ยกเลิกไป|มติยกเลิก|ปลดแล้ว|retired|removed|เคยเป็น|เดิมคือ'

if [ "${1:-}" = "--selftest" ]; then
    TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT; BAD=0; CASES=0
    # ไม่ใช้ \b กับคำไทย — grep ตัดสินขอบคำของอักษรไทยไม่แน่นอนตาม locale
    printf 'ห้ามคำ | 2026-01-01 | test | คำใหม่\n' > "$TMP/words.txt"
    mk() { mkdir -p "$1/.claude/skills/x"; printf '%s\n' "$2" > "$1/.claude/skills/x/SKILL.md"; }
    check() { # $1 ป้าย $2 root $3 exit ที่คาด $4 คำที่ต้องเห็น $5 ไฟล์ข้อมูล
        local out code; CASES=$((CASES+1))
        out="$(RETIRED_WORDS_ROOT="$2" RETIRED_WORDS_FILE="${5:-$TMP/words.txt}" bash "$0" 2>&1)"; code=$?
        if [ "$code" != "$3" ] || { [ -n "$4" ] && ! printf '%s' "$out" | grep -q "$4"; }; then
            echo "  ✗ $1 — คาด exit $3 ได้ $code"; printf '%s\n' "$out" | sed 's/^/      /'; BAD=1; return; fi
        echo "  ✓ $1"
    }
    A="$TMP/a"; mk "$A" "ใช้คำใหม่ทุกที่";                          check "ไม่มีคำเก่า = PASS" "$A" 0 "PASS"
    B="$TMP/b"; mk "$B" "ให้ใช้ ห้ามคำ ในขั้นนี้";                   check "คำเก่าที่ยังสอนอยู่ = FAIL" "$B" 1 "SKILL.md"
    C="$TMP/c"; mk "$C" "ห้ามคำ ถูกถอดเมื่อ 2026-01-01";             check "บรรทัดที่บรรยายการยกเลิก = PASS" "$C" 0 "PASS"
    D="$TMP/d"; mk "$D" "อะไรก็ได้";                                  check "ไม่มีไฟล์ข้อมูล = BLOCKED" "$D" 2 "BLOCKED" "$TMP/nope.txt"
    E="$TMP/e"; mk "$E" "อะไรก็ได้"; : > "$TMP/empty.txt";            check "ไฟล์ข้อมูลว่าง = FAIL (ตรวจศูนย์คำ = ไม่ได้ตรวจ)" "$E" 1 "ไม่มีคำ" "$TMP/empty.txt"

    # F: regex ที่มี "|" alternation เอง ต้องรอดทั้งเส้น ไม่ถูกฉีกที่ไปป์แรก
    printf 'aaa|ห้ามคำ(x|y) | d | r | ใหม่\n' > "$TMP/multi.txt"
    F="$TMP/f"; mk "$F" "มีคำว่า ห้ามคำy อยู่ตรงนี้"; check "regex หลาย alternative รอดทั้งเส้น" "$F" 1 "ใช้แทน: ใหม่" "$TMP/multi.txt"

    # G: พื้นผิวเป็นไฟล์เดี่ยวที่ root (CLAUDE.md) ต้องพิมพ์ชื่อไฟล์ ไม่ใช่แค่เลขบรรทัด
    G="$TMP/g"; mkdir -p "$G"; printf 'ห้ามคำ\n' > "$G/CLAUDE.md"
    check "ไฟล์เดี่ยวที่ root ต้องมีชื่อไฟล์ในผลลัพธ์" "$G" 1 "CLAUDE.md:1:"

    # H: regex พังในไฟล์ข้อมูล (grep exit 2) ต้อง BLOCKED ไม่ใช่ PASS เงียบ
    printf 'ห้ามคำ(( | 2026-01-01 | t | ใหม่\n' > "$TMP/badregex.txt"
    H="$TMP/h"; mk "$H" "มี ห้ามคำ อยู่"; check "regex พังในไฟล์ข้อมูล = BLOCKED" "$H" 2 "BLOCKED" "$TMP/badregex.txt"

    # I: ข้อความแทนที่มี "|" และ "&" ต้องออกมาตามตัวอักษร ไม่ผ่าน sed (ซึ่งพังกับอักขระนี้)
    printf 'ห้ามคำ | 2026-01-01 | t | a|b & c\n' > "$TMP/special.txt"
    I="$TMP/i"; mk "$I" "ให้ใช้ ห้ามคำ ในขั้นนี้"; check "ข้อความแทนที่มี pipe/& ออกมาตามตัวอักษร" "$I" 1 "ใช้แทน: a|b & c" "$TMP/special.txt"

    # J: narration filter ต้องกรองแค่ข้อความที่แมตช์ ไม่ใช่ path เต็ม — root ชื่อมีคำ narration
    J="$TMP/retired-root"; mk "$J" "ให้ใช้ ห้ามคำ ในขั้นนี้"; check "path มีคำ narration ไม่ทำให้ผลบวกหาย" "$J" 1 "SKILL.md"

    # K: "ยกเลิก" เดี่ยว ๆ (แปลว่า cancel) ต้องไม่ทำให้บรรทัดที่มีคำเก่าจริงหลุดผ่าน
    K="$TMP/k"; mk "$K" "ถ้าผู้ใช้กดยกเลิกคำขอ ให้อัปโหลดห้ามคำใหม่"; check "ยกเลิก=cancel ไม่ทำให้ narration ตัดสิทธิ์" "$K" 1 "SKILL.md"

    # L: แถวข้อมูลไม่ครบ 4 ฟิลด์ (ไม่มีตัวคั่น " | " เลย) ต้อง BLOCKED ระบุแถว
    printf 'ห้ามคำ\n' > "$TMP/badrow.txt"
    L="$TMP/l"; mk "$L" "อะไรก็ได้"; check "แถวข้อมูลผิดรูปแบบ = BLOCKED ระบุแถว" "$L" 2 "BLOCKED" "$TMP/badrow.txt"

    # M: comment ที่เยื้องด้วยเว้นวรรคต้องถูกข้าม ไม่ใช่ตีความเป็นแถวข้อมูลผิดรูปแบบ
    printf '   # comment เยื้อง ห้ามคำ\nห้ามคำ | 2026-01-01 | t | ใหม่\n' > "$TMP/indented.txt"
    M="$TMP/m"; mk "$M" "ให้ใช้ ห้ามคำ ในขั้นนี้"; check "comment เยื้องถูกข้าม ไม่ block" "$M" 1 "SKILL.md" "$TMP/indented.txt"

    # N: mktemp ล้มเหลว (เช่น TMPDIR ชี้ไปที่ path ที่ไม่มีจริง) ต้อง BLOCKED ไม่ใช่ PASS เงียบ
    # (final-review M1: >> ""/cat "" ที่ไม่มี HITFILE เคยพังเงียบภายใต้ set -u โดยไม่มี -e)
    N="$TMP/n"; mk "$N" "มีคำว่า ห้ามคำ อยู่ตรงนี้"; CASES=$((CASES+1))
    nout="$(RETIRED_WORDS_ROOT="$N" RETIRED_WORDS_FILE="$TMP/words.txt" TMPDIR="/nonexistent-dir-$$" bash "$0" 2>&1)"; ncode=$?
    if [ "$ncode" != "2" ] || ! printf '%s' "$nout" | grep -q "BLOCKED"; then
        echo "  ✗ mktemp ล้มเหลว = BLOCKED — คาด exit 2 ได้ $ncode"; printf '%s\n' "$nout" | sed 's/^/      /'; BAD=1
    else
        echo "  ✓ mktemp ล้มเหลว = BLOCKED"
    fi

    echo "selftest: $CASES เคส"; [ "$BAD" = 0 ] || exit 1
    echo "PASS: selftest ครบทั้งสองทิศ"; exit 0
fi

[ -f "$DATA" ] || blocked "ไม่มีไฟล์ข้อมูล $DATA"
grep -vqE '^\s*(#|$)' "$DATA" || fail "ไม่มีคำในไฟล์ข้อมูล — probe ที่ตรวจศูนย์คำไม่ได้ตรวจอะไรเลย"
echo "ไม่อ่าน: apps/ docs/ scripts/ evidence/ reports/ — ดูหัวไฟล์"

# หมายเหตุ: ลูปทั้งหมดนี้รันในเชลล์หลัก (ไม่ใช่ $(...) subshell) เพื่อให้ blocked()/fail()
# เรียก exit ได้จริง — เดิม scan() ถูกครอบด้วย $(scan) ทำให้ grep exit 2 / regex พัง
# เงียบหายไปเฉย ๆ (ปัญหาที่ report ชี้ #2,#3,#4)
HITFILE="$(mktemp)" || blocked "mktemp ล้มเหลว — ไม่มี temp dir ให้เขียน (เช็ค \$TMPDIR)"
trap 'rm -f "$HITFILE"' EXIT
lineno=0
while IFS= read -r line; do
    lineno=$((lineno + 1))
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue

    nsep=$(printf '%s' "$line" | grep -Fo ' | ' | wc -l)
    [ "$nsep" -eq 3 ] || blocked "retired-words.txt แถว $lineno ไม่ใช่ 4 ฟิลด์ (ต้องคั่นด้วย \" | \" 3 ที่): $line"

    instead="${line##* | }";  rest="${line% | *}"
    ref="${rest##* | }";      rest="${rest% | *}"
    ruled="${rest##* | }";    pattern="${rest% | *}"
    pattern="$(printf '%s' "$pattern" | sed 's/^ *//; s/ *$//')"
    [ -n "$pattern" ] || blocked "retired-words.txt แถว $lineno regex ว่างเปล่า"

    for t in "${SURFACE[@]}"; do
        [ -e "$SCAN_ROOT/$t" ] || continue
        r="$(grep -rnHIE -e "$pattern" "$SCAN_ROOT/$t" 2>/dev/null)"; code=$?
        [ "$code" -eq 2 ] && blocked "retired-words.txt แถว $lineno regex ผิดรูปแบบ (grep exit 2): $pattern"
        [ -z "$r" ] && continue
        while IFS= read -r hitline; do
            [ -n "$hitline" ] || continue
            fpath="${hitline%%:*}"; remainder="${hitline#*:}"
            hitlineno="${remainder%%:*}"; text="${remainder#*:}"
            # กรอง narration บนข้อความที่แมตช์เท่านั้น — ไม่ใช่ path:line: เต็ม (ปัญหา #4:
            # checkout ใต้โฟลเดอร์ชื่อมีคำ narration เช่น retired-clone/ ไม่ทำให้ hit จริงหาย)
            printf '%s' "$text" | grep -qE "$NARRATION" && continue
            relpath="${fpath#$SCAN_ROOT/}"
            printf '%s:%s:%s  ← ใช้แทน: %s\n' "$relpath" "$hitlineno" "$text" "$instead" >> "$HITFILE"
        done <<< "$r"
    done
done < "$DATA"

HITS="$(cat "$HITFILE")"
[ -n "$HITS" ] && fail "คำที่ถูกยกเลิกยังถูกสอนอยู่ $(printf '%s\n' "$HITS" | grep -c .) บรรทัด:
$HITS"
pass "พื้นผิวคำสั่งไม่มีคำที่ถูกยกเลิก ($(grep -cvE '^\s*(#|$)' "$DATA") คำ · ${#SURFACE[@]} พื้นผิว)"
