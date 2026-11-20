#!/usr/bin/env bash
#
# B1 gate — run by the operator, on purpose.
#
# Two writes to the shared Supabase database, in this order and no other:
#   1. prisma migrate deploy   → adds three NULLABLE columns to requirement_rules
#                                (landTenure, areaType, certScope). No existing row
#                                changes meaning; nothing is dropped or renamed.
#   2. seed --apply            → files the 23 cannabis กทล.1 rule rows, in ONE
#                                transaction: it either all lands or nothing does.
#
# Checked before writing this script (2026-09-04): the backend images running as
# prod, preview and staging contain NO file that reads requirement_rules, so
# neither write is visible to anyone using the platform today. The rules take
# effect when a build carrying the B1 code is deployed, which is a separate act.
#
# Safe to re-run: migrate deploy skips what is applied, and the seed skips a row
# whose identical law is already in force.
set -euo pipefail

cd /home/ubuntu/work/GACP-Certification-Application/apps/backend

echo "=============================================================="
echo "B1 GATE — step 1 of 2: apply the pending migration"
echo "=============================================================="
# `migrate status` exits 1 while anything is pending — that is the normal state
# here, not a failure, so it must not trip `set -e`.
npx prisma migrate status 2>&1 | tail -20 || true
echo
npx prisma migrate deploy
echo

echo "--- verify the three columns exist -----------------------------"
node -e "
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const rows = await p.\$queryRawUnsafe(\"select column_name from information_schema.columns where table_name='requirement_rules' and column_name in ('landTenure','areaType','certScope') order by 1\");
  console.log('columns:', rows.map(r => r.column_name).join(', ') || '(none — STOP, the migration did not land)');
  await p.\$disconnect();
})();
" 2>&1 | grep -vE "dotenv|^info:"
echo

echo "=============================================================="
echo "B1 GATE — step 2 of 2: file the cannabis rule set (23 rows)"
echo "=============================================================="
# --i-know is the seed's own confirmation gate. It fires because this .env carries
# NODE_ENV=production (the dev tree points at the shared Supabase database), and it
# asks the right question: filing กทล.1 as national policy on the live register is an
# operator act, not a script's. The operator instructed it on 2026-09-04, in writing,
# after being shown what the 23 rows are and that no running build reads this table.
node scripts/seed-cannabis-requirement-rules.js --apply --i-know
echo

echo "--- verify what is now in force --------------------------------"
node -e "
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const open = await p.\$queryRawUnsafe('select count(*)::int n from requirement_rules where \"effectiveTo\" is null');
  const cannabis = await p.\$queryRawUnsafe(\"select count(*)::int n from requirement_rules where \\\"effectiveTo\\\" is null and \\\"plantCode\\\"='cannabis'\");
  console.log('open rules total :', open[0].n, '(expected 25 = 2 existing + 23 new)');
  console.log('of them cannabis :', cannabis[0].n, '(expected 23)');
  await p.\$disconnect();
})();
" 2>&1 | grep -vE "dotenv|^info:"

echo
echo "=============================================================="
echo "B1 GATE DONE. Tell Claude the numbers above and it will verify"
echo "the rest, then ask you for the one word: merge."
echo "=============================================================="
