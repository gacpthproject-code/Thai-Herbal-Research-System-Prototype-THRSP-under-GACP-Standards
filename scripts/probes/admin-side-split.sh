#!/usr/bin/env bash
# admin-side-split — every runtime path that changes another account asks the two-sided rule
# before it writes (orders 13 and 34(2); review M2 of fix/admin-role-split).
#
# The scan lives in admin-side-split.js next to this file: it discovers every write to users,
# user_group_memberships and user_permission_grants under apps/backend (no file list), follows
# calls by name, walks router.<verb> and router.route().<verb>, and requires a real, unconditional
# assertSameSideChange call before the first write; target: null only in create doors. Its
# --selftest runs the review's mutants against the whole tree.
#
# Contract: exit 0 PASS · 1 FAIL · 2 BLOCKED (cannot run) — see _lib.sh.
# Usage:  bash scripts/probes/admin-side-split.sh [--selftest | --list]
#         ADMIN_SIDE_ROOT=<dir holding apps/backend> bash scripts/probes/admin-side-split.sh
source "$(dirname "$0")/_lib.sh"
command -v node >/dev/null 2>&1 || blocked "node is not on PATH"
exec node "$(dirname "$0")/admin-side-split.js" "$@"
