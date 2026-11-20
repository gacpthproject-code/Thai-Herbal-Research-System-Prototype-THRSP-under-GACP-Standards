#!/bin/sh
# Sum VmRSS of every process except the sampler itself (node names its main thread "MainThread") in the container every 50 ms while the job runs.
/usr/bin/time -v node /measure/run.js > /tmp/run.out 2> /tmp/time.err &
P=$!
max=0
while kill -0 $P 2>/dev/null; do
  s=$(for f in /proc/[0-9]*/status; do cat "$f" 2>/dev/null; done | awk '/^Name:/{n=$2} /^VmRSS:/{if(n!="sh" && n!="cat" && n!="awk" && n!="sleep" && n!="time")t+=$2} END{print t+0}')
  [ "$s" -gt "$max" ] && max=$s
  sleep 0.05
done
cat /tmp/run.out
grep -E "Maximum resident|Elapsed|Percent of CPU|User time|System time" /tmp/time.err
grep -i "error\|failed" /tmp/time.err | head -5
echo "PEAK_TREE_RSS_KB=$max"
