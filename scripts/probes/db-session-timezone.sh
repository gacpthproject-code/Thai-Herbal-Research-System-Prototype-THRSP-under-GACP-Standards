#!/usr/bin/env bash
# db-session-timezone — a new connection to the database must report SHOW timezone = UTC. The schema
# stores timestamp(3) with no zone, and code that takes the time from Postgres (NOW(), a trigger, a
# column default) writes the session's wall clock, so any other zone shifts those values or makes
# their comparisons match nothing, with no error.
#
# The setting lives on the database (migration 20261107120000_database_session_timezone_utc), and
# three things lose it with no error: an ALTER ROLE ... SET timezone, a restore into a newly created
# database from a pg_dump taken without --create, and a server default that is not UTC on a new host.
# Only a real connection sees the result of all three. "Etc/UTC" is a FAIL on purpose: it means the database setting is gone and
# the server default happens to be close.
#
# Read-only. BLOCKED (exit 2), never a vacuous pass, when it cannot look. DATABASE_URL must be the
# URL the backend uses. A deploy is proved when its runbook runs the deploy walk (row jobs, check
# db-session-timezone), which runs the same statement inside the backend container. No deploy script
# calls the walk.
#
# Only DATABASE_URL picks the target. A URL that leaves out the host or the database, or that moves
# them with a query parameter, is BLOCKED, and the shell's PG* variables and ~/.psqlrc are not used.
#
# psql's stderr is dropped, not redacted. It can quote the URL or the bare password, as in
# `invalid percent-encoded token: "<password>"`, where no URL pattern can find it.
#
# Usage:  bash scripts/probes/db-session-timezone.sh
#         bash scripts/probes/db-session-timezone.sh --selftest
#         DB_SESSION_TIMEZONE_PSQL=<path> bash scripts/probes/db-session-timezone.sh
source "$(dirname "$0")/_lib.sh"

PSQL="${DB_SESSION_TIMEZONE_PSQL:-psql}"

if [ "${1:-}" = "--selftest" ]; then
    TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT; BAD=0; CASES=0
    stub() { # $1 name  $2 stdout  $3 exit-code
        printf '#!/usr/bin/env bash\nprintf "%%s\\n" "%s"\nexit %s\n' "$2" "$3" >"$TMP/$1"
        chmod +x "$TMP/$1"
    }
    check() { # $1 label  $2 psql-path  $3 database-url  $4 expected-exit  [$5 needle]  [$6 secret]
        local out code
        CASES=$((CASES + 1))
        out="$(DB_SESSION_TIMEZONE_PSQL="$2" DATABASE_URL="$3" PROBE_OUT_DIR="$TMP/ev" bash "$0" 2>&1)"; code=$?
        echo "--- selftest $1 -> exit $code (expected $4)"; printf '%s\n' "$out"
        [ "$code" = "$4" ] || { echo "*** $1 FAILED: exit $code != $4"; BAD=$((BAD + 1)); }
        if [ -n "${5:-}" ] && ! printf '%s' "$out" | grep -q -- "$5"; then
            echo "*** $1 FAILED: output does not mention '$5'"; BAD=$((BAD + 1))
        fi
        if [ -n "${6:-}" ] && { printf '%s' "$out" | grep -qF -- "$6" || grep -rqF -- "$6" "$TMP/ev"; }; then
            echo "*** $1 FAILED: the secret reached the output or a file"; BAD=$((BAD + 1))
        fi
        echo
    }
    stub psql-utc UTC 0
    stub psql-bkk Asia/Bangkok 0
    stub psql-etc Etc/UTC 0
    stub psql-dead '' 2
    printf '#!/usr/bin/env bash\nprintf "%%s\\n" "${PGTZ:-UTC}"\n' >"$TMP/psql-env"; chmod +x "$TMP/psql-env"
    printf '#!/usr/bin/env bash\n[ "$1" = "%s" ] && echo UTC || echo "got $1"\n' 'postgresql://x/y?sslmode=require&options=-c' >"$TMP/psql-url"; chmod +x "$TMP/psql-url"
    printf '#!/usr/bin/env bash\n[ "$1" = "%s" ] && echo UTC || echo "got $1"\n' 'postgresql://x/y' >"$TMP/psql-bare"; chmod +x "$TMP/psql-bare"
    printf '%s\n' '#!/usr/bin/env bash' 'echo "psql: error: invalid connection option \"$1\"" >&2' 'exit 1' >"$TMP/psql-leak"; chmod +x "$TMP/psql-leak"

    # Answers like libpq behind Debian's psql wrapper: without -X, ~/.psqlrc runs, an unset PGPORT becomes
    # the local cluster's port, and any other target variable reaches a database the URL does not name.
    diverted() { # $1 name  $2 zone of the database in the URL  $3 zone of any other database
        cat >"$TMP/$1" <<STUB
#!/usr/bin/env bash
case " \$* " in *" -X "*) ;; *) echo "$3"; exit 0 ;; esac
[ "\${PGPORT:-5433}" = 5432 ] || { echo "$3"; exit 0; }
[ -z "\${PGHOST:-}\${PGHOSTADDR:-}\${PGDATABASE:-}\${PGUSER:-}\${PGSERVICE:-}\${PGSERVICEFILE:-}" ] || { echo "$3"; exit 0; }
echo "$2"
STUB
        chmod +x "$TMP/$1"
    }
    diverted psql-url-bkk Asia/Bangkok UTC
    diverted psql-url-utc UTC Asia/Bangkok

    check A "$TMP/psql-utc" 'postgresql://x/y' 0 'UTC'                      # UTC → PASS
    check B "$TMP/psql-bkk" 'postgresql://x/y' 1 'Asia/Bangkok'             # another zone → FAIL naming it
    check C "$TMP/psql-etc" 'postgresql://x/y' 1 'Etc/UTC'                  # setting lost on a UTC server → FAIL
    check D "$TMP/psql-utc" ''                 2 'needs DATABASE_URL'       # no URL → BLOCKED
    check E "$TMP/does-not-exist" 'postgresql://x/y' 2 'needs DATABASE_URL' # no psql → BLOCKED
    check F "$TMP/psql-dead" 'postgresql://x/y' 2 'query failed'            # cannot connect → BLOCKED
    check G "$TMP/psql-url" 'postgresql://x/y?schema=public&pgbouncer=true&sslmode=require&connection_limit=1&options=-c' 0 'UTC' # Prisma-only parameters leave, the rest stay
    check H "$TMP/psql-bare" 'postgresql://x/y?schema=public&pgbouncer=true' 0 'UTC'  # nothing left → no dangling ?
    PGTZ=Asia/Bangkok check I "$TMP/psql-env" 'postgresql://x/y' 0 'UTC'    # the shell's PGTZ is not the backend's session
    check J "$TMP/psql-leak" '"postgresql://fakeuser:fakeSECRETpw@127.0.0.1:1/db?sslmode=disable"' 2 'query failed' 'fakeSECRETpw' # psql quotes the URL back
    check K "$TMP/psql-leak" ' postgresql://fakeuser:fakeSECRETpw@127.0.0.1:1/db' 2 'query failed' 'fakeSECRETpw'
    check L "$TMP/psql-leak" 'postgresql://fakeuser:fake%zzSECRETpw@127.0.0.1:1/db' 2 'query failed' 'SECRETpw'      # no scheme:// left for a redact pattern to match
    check M "$TMP/psql-bare" '"postgresql://x/y"' 0 'UTC'                   # the value grep | cut reads from an env file
    check N "$TMP/psql-bare" ' postgresql://x/y' 0 'UTC'
    check O "$TMP/psql-bare" " ' postgresql://x/y' "$'\r' 0 'UTC'            # quotes, spaces and a CRLF file together
    check P "$TMP/psql-utc" '""'               2 'needs DATABASE_URL'       # nothing inside the quotes → BLOCKED, never libpq's defaults
    check Q "$TMP/psql-url-bkk" 'postgresql://x/y' 1 'Asia/Bangkok'         # a ~/.psqlrc or a local cluster cannot answer for the URL
    check R "$TMP/psql-url-utc" 'postgresql://x/y' 0 'UTC'
    for v in PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGSERVICE PGSERVICEFILE; do
        export "$v=elsewhere"
        check "$v cannot hide Bangkok" "$TMP/psql-url-bkk" 'postgresql://x/y' 1 'Asia/Bangkok'
        check "$v cannot fake Bangkok" "$TMP/psql-url-utc" 'postgresql://x/y' 0 'UTC'
        unset "$v"
    done
    for url in 'postgresql://' 'postgresql://?schema=public' 'postgresql://u:x@/' 'postgresql://x' 'postgresql://x/' \
        'postgresql://x/?sslmode=require' 'postgresql:///y' 'decoy' 'mysql://x/y'; do
        check "no target in $url" "$TMP/psql-utc" "$url" 2 'must name'
    done
    for param in host hostaddr port dbname user service; do
        check "?$param= overrides the URL" "$TMP/psql-utc" "postgresql://x/y?$param=z" 2 'must name'
    done
    check 'one quote, or psql takes the URL for a database name' "$TMP/psql-utc" '"postgresql://fakeuser:fakeSECRETpw@127.0.0.1:1/db' 2 'must name' 'fakeSECRETpw'
    for url in 'postgresql://u:x@h/y' 'postgres://x/y' 'postgresql://u:x@[::1]:5433/y' 'postgresql://u:x@h:5433/y?sslmode=require&options=-c'; do
        check "full URL $url" "$TMP/psql-utc" "$url" 0 'UTC'
    done

    echo "=================================================="
    [ "$BAD" -eq 0 ] && { echo "db-session-timezone --selftest: $CASES/$CASES cases PASS"; exit 0; }
    echo "db-session-timezone --selftest: $BAD assertion(s) FAILED"; exit 1
fi

# Runbooks read the URL with grep | cut, which keeps an env file's quotes, spaces and CR. libpq refuses
# the Prisma-only parameters. Everything else stays, options= above all, because it can set the zone
# itself.
URL="$(printf '%s' "${DATABASE_URL:-}" | sed -E "s/^[[:space:]]+|[[:space:]]+\$//g;s/^([\"'])(.*)\1\$/\2/;s/^[[:space:]]+|[[:space:]]+\$//g" \
    | sed -E ':a;s/([?&])(pgbouncer|schema|connection_limit|pool_timeout)=[^&]*&?/\1/;ta;s/[?&]$//')"
{ [ -z "$URL" ] || ! command -v "$PSQL" >/dev/null 2>&1; } \
    && blocked "needs DATABASE_URL + psql against the real DB — no vacuous pass"
# Anything else lets libpq take the target from somewhere other than the URL. A word with no scheme is a
# database name to psql, so a URL with one stray quote would reach the server's log, password included.
FULL_URL='^postgres(ql)?://([^/?#]*@)?(\[[^]]+\]|[^][/?#:@]+)(:[0-9]*)?/[^/?#]'
MOVES_TARGET='[?&](host|hostaddr|port|dbname|user|service)='
[[ "$URL" =~ $FULL_URL && ! "$URL" =~ $MOVES_TARGET ]] \
    || blocked "DATABASE_URL must name its own target as postgresql://host[:port]/database, with no host, hostaddr, port, dbname, user or service parameter — the value is not shown because it can hold a password"
# PGPORT is set, not unset, because Debian's psql wrapper fills an unset PGPORT with the local cluster's
# port. A port in the URL still wins.
ZONE="$(env -u PGTZ -u PGOPTIONS -u PGHOST -u PGHOSTADDR -u PGDATABASE -u PGUSER -u PGSERVICE -u PGSERVICEFILE PGPORT=5432 \
    "$PSQL" "$URL" -X -tAc "SHOW timezone" 2>/dev/null | tr -d '[:space:]')"
[ -z "$ZONE" ] && blocked "query failed — psql's message is not shown because it can quote the password"
[ "$ZONE" = "UTC" ] && pass "a new connection runs in UTC"
fail "a new connection runs in '$ZONE', not UTC — see docs/operations/runbooks/deploy-database-session-timezone.md"
