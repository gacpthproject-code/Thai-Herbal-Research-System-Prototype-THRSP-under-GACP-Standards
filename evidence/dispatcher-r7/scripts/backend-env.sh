# Sourced by the round-7 backend jobs: the scratch database and a private signing-key folder, read from 0600 files.
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
TEST_DATABASE_URL="$(cat /tmp/dispatcher-r7/secret/db-url)"
export TEST_DATABASE_URL
export DATABASE_URL="$TEST_DATABASE_URL"
export SIGNING_KEY_DIR=/tmp/dispatcher-r7/secret/signing-keys
RSA_PRIVATE_KEY_PASSPHRASE="$(cat /tmp/dispatcher-r7/secret/signing-passphrase)"
export RSA_PRIVATE_KEY_PASSPHRASE
export PAYMENT_ADAPTER=mock
export NODE_OPTIONS=--max-old-space-size=3072
# Refuse to go on unless DATABASE_URL is the round-7 scratch database (port of disp-r7-pg, database gacp_r7).
r7_port=$(docker port disp-r7-pg 5432/tcp | head -1 | sed 's/.*://')
case "$DATABASE_URL" in
  *"@127.0.0.1:${r7_port}/gacp_r7?"*) echo "[r7-env] DATABASE_URL is the scratch database 127.0.0.1:${r7_port}/gacp_r7" >&2 ;;
  *) echo "[r7-env] DATABASE_URL is NOT the round-7 scratch database; refusing" >&2; return 3 2>/dev/null || exit 3 ;;
esac
