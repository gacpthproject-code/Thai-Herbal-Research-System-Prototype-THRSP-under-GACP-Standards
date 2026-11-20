# Sourced by the round-6 backend jobs: the scratch database and a private signing-key folder, read from 0600 files.
export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH
TEST_DATABASE_URL="$(cat /tmp/dispatcher-r6/secret/db-url)"
export TEST_DATABASE_URL
export DATABASE_URL="$TEST_DATABASE_URL"
export SIGNING_KEY_DIR=/tmp/dispatcher-r6/secret/signing-keys
RSA_PRIVATE_KEY_PASSPHRASE="$(cat /tmp/dispatcher-r6/secret/signing-passphrase)"
export RSA_PRIVATE_KEY_PASSPHRASE
export NODE_OPTIONS=--max-old-space-size=3072
