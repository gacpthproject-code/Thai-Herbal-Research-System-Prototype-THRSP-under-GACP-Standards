#!/usr/bin/env bash
# demo-survey — READ-ONLY survey of the demo server before the staging slot is added (order 164(2)).
# Runs ON the demo server. The operator starts it from the Windows PC (PowerShell), in the repo folder:
#
#   Get-Content scripts\ops\demo-survey.sh -Raw | ssh deploy@119.59.105.140 "bash -s" > demo-survey.txt
#
# then gives demo-survey.txt to the dev session, which compares commits and migrations with main and writes
# docs/operations/demo-host-survey-2026-11.md. Every command here is a read: free, df, nproc, docker
# ps/stats/volume/images/system df, ss, a SELECT on _prisma_migrations, sshd -T. No env file is read, no
# secret value is printed (env files are listed by name and mode only).
set -uo pipefail
sec() { printf '\n### %s\n' "$1"; }
sec "host";       hostname; date -Is; cat /etc/os-release 2>/dev/null | grep PRETTY_NAME; nproc; uptime
sec "memory";     free -g
sec "disk";       df -h / /opt /var/lib/docker 2>/dev/null | sort -u
sec "containers"; docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
sec "stats";      docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}'
sec "volumes";    docker volume ls --format '{{.Name}}'
sec "networks";   docker network ls --format '{{.Name}}\t{{.Driver}}'
sec "images";     docker images --format '{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}' | head -30
sec "docker df";  docker system df
sec "listening";  ss -ltnp 2>/dev/null | awk 'NR==1 || /LISTEN/' | sed 's/users:.*//'
sec "platform dir"; ls -la /opt/gacp-platform 2>/dev/null | awk '{print $1, $3, $4, $NF}'
sec "env files (name + mode only)"; find /opt/gacp-platform -maxdepth 1 -name '.env*' -printf '%m %u %f\n' 2>/dev/null
sec "nginx vhosts"; ls -la /etc/nginx/conf.d /etc/nginx/sites-enabled 2>/dev/null | awk '{print $1, $NF}'
sec "applied migrations"
pg=$(docker ps --format '{{.Names}}' | grep -E '^gacp-postgres' | head -1)
[ -n "$pg" ] && docker exec "$pg" sh -c 'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select migration_name from _prisma_migrations where finished_at is not null and rolled_back_at is null order by 1"' \
  || echo "no gacp-postgres container found"
sec "running revision"
curl -fsS --max-time 10 -H 'Host: demo.gacpth.com' http://127.0.0.1/api/health 2>/dev/null | head -c 300 || echo "local health not reachable on :80"
sec "backup cron"; crontab -l 2>/dev/null | grep -i backup; ls /etc/cron.d 2>/dev/null; ls -la /var/backups/gacp 2>/dev/null | tail -5
sec "sshd (order 164(5))"; sudo -n sshd -T 2>/dev/null | grep -Ei '^(permitrootlogin|passwordauthentication|pubkeyauthentication)' || echo "sshd -T needs sudo — operator checks: sudo sshd -T | grep -Ei 'permitrootlogin|passwordauthentication'"
sec "firewall"; sudo -n firewall-cmd --list-all 2>/dev/null | head -20 || echo "firewall-cmd needs sudo"
