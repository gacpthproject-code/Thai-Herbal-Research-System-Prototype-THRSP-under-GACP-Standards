#!/usr/bin/env bash
# usage: formdata-key-readers.sh <repo-root> <key...>
# Prints every non-test backend line that names the key as a property (x.key, x?.key, x['key']),
# so each formData key an applicant can land is traced to the code that would read it.
root="$1"; shift
cd "$root/apps/backend" || exit 1
for key in "$@"; do
  echo "=== $key"
  grep -rnE "(\.|\?\.)${key}\b|\[['\"]${key}['\"]\]|\b${key}\s*:" --include=*.js \
    services routes jobs shared modules controllers middleware utils validation constants workers 2>/dev/null \
    | grep -v "__tests__" | grep -vE "^\S+:[0-9]+:\s*(\*|//)" | head -25
done
