# document-precheck Task 10 — evidence index (2026-09-28)

| file | what |
|---|---|
| `red-output.txt` | RED run (summary, raw log not committed) of the 5 new/extended test files against HEAD cd6b2bfe sources |
| `test-output.txt` | GREEN runs + full backend suite + integration dir + web jest + probes + tier-check (summaries) |
| `m1-review-read-without-migration.txt` | proof for the M1 comment: the officer's review read gets P2022 on a DB one migration behind |
| `measure/` | the resource measurement below: scripts + raw numbers (`runs-output.txt`) |
| `fix-round-1-red-output.txt` / `fix-round-1-test-output.txt` | fix round 1 (erasure clears precheck text · disclaimer below heading · 404 pin) |

## Resources — the pre-check processor inside the real backend image

**Method.** `git clone` of this worktree at `ccfdf083` → `docker build -f apps/backend/Dockerfile -t local-precheck-measure .`
(node:24-alpine, the production Dockerfile unchanged). The container ran `jobs/document-precheck-processor.js` once,
in-process, on a PENDING `company_reg` row seeded on the scratch Postgres (127.0.0.1:5436), for one **scanned 3-page A4 PDF**:
each page a full-page greyscale PNG (1240×1740 px ≈ 150 dpi, 27 lines of Thai) from `make-corpus.js`'s own `renderPagePng`,
embedded as the page's only object (`measure/make-npage-scan.js <backend> out.pdf 3`; 822 KB, no text layer → OCR path).
Limits = staging's backend limits (`docker-compose.staging.yml:57`: `cpus 0.50`, `memory 512M`) via `--cpus=0.5 --memory=512m`.
Wall = `process.hrtime` around the processor call. Memory three ways: `/usr/bin/time -v` max RSS of the node process;
`sample.sh` = sum of VmRSS of every process in the container every 50 ms (main + the forked pdf.js worker);
`cgroup-run.sh` = the container's cgroup `memory.current` / `anon` sampled from the host every 50 ms.
Image and containers removed after (`docker rmi` output in `test-output.txt`).

**Numbers** (`measure/runs-output.txt`) — every run: `DONE`, `OCR`, 3 pages, confidence 93, 5 flags.

| run | limits | wall | node max RSS | tree peak RSS (Σ) | cgroup peak (current / anon) |
|---|---|---|---|---|---|
| 3 pages ×3 | 0.5 CPU, 512M | 18.0 / 18.1 / 18.2 s | 211 MiB | 234–250 MiB | — |
| 3 pages | 0.5 CPU, 512M | 18.6 s | 210 MiB | 249 MiB | 147 / 143 MiB |
| 3 pages | none (4 cores) | 6.7 s | 217 MiB | 252 MiB | — |
| 10 pages (= `maxPages`) | 0.5 CPU, 512M | 50.4 s | 223 MiB | 319 MiB | — |

Process RSS before the job (node + Prisma + processor loaded): ~81 MiB. RSS counts shared file pages (node binary,
libraries); the cgroup `anon` figure is what the job adds to a container's charge.

**Why concurrency 1** (`services/queue-service.js:66` `precheckQueue.process(1, …)`), against staging:
- memory: the running `gacp-backend-staging` (read-only `docker stats` / cgroup `memory.stat`, 2026-09-28) holds
  **anon 268 MiB of 512 MiB** at idle (`docker top` shows `node server.js` plus a resident puppeteer chromium). One job adds ~143 MiB anon
  (upper bound ~250 MiB RSS) → ~411–518 MiB: fits, at the edge. Two jobs (~286 MiB anon) → ~554 MiB > 512 MiB = OOM kill.
- CPU: 0.5 CPU is shared with the API. One 3-page scan keeps it busy 18 s (~6 s/page); a second job would halve both.
- time: 10 pages take 50.4 s against the 60 s extraction limit (`service.js:81`) — concurrency 2 on the same 0.5 CPU
  would push a 10-page job past it (retry → FAILED).
- production (`docker-compose.production.yml:82`, 1G / 1.0 CPU) could take 2; staging and demo (512M) cannot. One value
  for all environments ⇒ 1. Headroom and the 60 s margin are logged in BACKLOG-FOUND.md (Task 10 section).

**Limit of these numbers — DEPLOY PRECONDITION (fix round 1, security review I2).** The job was measured
in-process (one fresh node process per run). In production the queue runs it in a Bull sandbox child, and Bull keeps
that child alive after its first job (bull 4.16.5 `lib/process/child-pool.js:71-74`: `release` returns the child to the
free pool instead of killing it). The staging idle figure (268 MiB anon) was taken with no such child. So the real
steady state is "idle + a resident child", which was not measured. **Before deploying to staging/demo the operator
either raises the backend memory limit to 768M–1G, or caps OCR pages at 5 and re-measures through the real Bull path
(idle after the first job + 10-page cgroup anon).** `maxPages` stays 10 in code (`service.js:81`). Not re-measured in
this round by instruction.
