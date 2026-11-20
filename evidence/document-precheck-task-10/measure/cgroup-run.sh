#!/bin/bash
SP="$1"
CID=$(docker run -d --name precheck-measure --network host --cpus=0.5 --memory=512m -e DATABASE_URL="$SCRATCH_DATABASE_URL" -v "$SP/measure:/measure:ro" --entrypoint sh local-precheck-measure /measure/sample.sh)
CG=/sys/fs/cgroup/system.slice/docker-$CID.scope
maxcur=0; maxanon=0
while [ "$(docker inspect -f '{{.State.Running}}' "$CID" 2>/dev/null)" = "true" ]; do
  c=$(cat "$CG/memory.current" 2>/dev/null || echo 0)
  a=$(awk '/^anon /{print $2}' "$CG/memory.stat" 2>/dev/null || echo 0)
  [ "${c:-0}" -gt "$maxcur" ] && maxcur=$c
  [ "${a:-0}" -gt "$maxanon" ] && maxanon=$a
  sleep 0.05
done
docker logs "$CID" 2>&1 | grep -E "wallMs|Maximum resident|PEAK_TREE"
echo "CGROUP_PEAK_MEMORY_CURRENT_MiB=$((maxcur/1048576)) CGROUP_PEAK_ANON_MiB=$((maxanon/1048576))"
docker rm -f "$CID" >/dev/null
