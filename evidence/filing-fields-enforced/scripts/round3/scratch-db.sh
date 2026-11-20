#!/usr/bin/env bash
# Round 3 scratch Postgres (ff-pg was removed after round 2): container + migrations. The
# migrations seed the register's two M2A rows (company_reg JURISTIC, community_cert), the same
# register rounds 1-2 ran on. /tmp/ff/pg.env (0600) holds DATABASE_URL and POSTGRES_PASSWORD.
set -euo pipefail
cd /home/ubuntu/work/wt-filingfields/apps/backend
set -a; . /tmp/ff/pg.env; set +a
docker ps -a --format '{{.Names}}' | grep -qx ff-pg || docker run -d --name ff-pg -e POSTGRES_PASSWORD -e POSTGRES_DB=gacp_ff -p 127.0.0.1:55533:5432 postgres:16 >/dev/null
for i in $(seq 1 30); do pg_isready -h 127.0.0.1 -p 55533 -q && break; sleep 1; done
npx prisma migrate deploy --schema prisma/schema 2>&1 | grep -v "postgresql://" | tail -3
