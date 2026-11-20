# Third-party skills: anthropics/skills

- Source: https://github.com/anthropics/skills (Anthropic, official)
- Vendored at commit: `b29e7cf65e5cb78a5ac33d582270551bc74a14eb` (2026-07-24, "Update claude-api skill: Claude Opus 5 (#1476)")
- Vendored on: 2026-08-07 (`GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1`)
- Installed skills (1): **frontend-design**

## What was copied

| path in repo | source path | sha256 |
|---|---|---|
| `.claude/skills/frontend-design/SKILL.md` | `skills/frontend-design/SKILL.md` | `1608ea77fbb6fc30d13a97d12cfa8ebf31358d40f0dd97beed24829d6b3f45dd` |
| `.claude/skills/frontend-design/LICENSE.txt` | `skills/frontend-design/LICENSE.txt` | `0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594` |

The sha256 values above are the upstream files at vendor time. `LICENSE.txt` is still
byte-identical. `SKILL.md` is upstream plus one block-quoted repo note under the frontmatter
(2026-11-03, skills review finding FD-1), marked in the file as a change per Apache-2.0 §4(b);
every other line is unchanged.

## License

The repository has **no root LICENSE file**. Licensing is **per skill**:
`skills/frontend-design/LICENSE.txt` is the **Apache License 2.0** (177 lines,
standard text, no NOTICE file in the skill directory). That file is vendored
alongside `SKILL.md` — do not delete it; Apache-2.0 §4(a) requires the license
to travel with the copy. `SKILL.md` frontmatter also carries
`license: Complete terms in LICENSE.txt`.

Upstream README states the document skills (`docx`/`pdf`/`pptx`/`xlsx`) are
**source-available, not open source** — a further reason not to vendor them
(see below).

## Pre-copy scan (done before copying)

- File inventory: exactly 2 files — `SKILL.md`, `LICENSE.txt`. **No scripts, no
  binaries, no assets.** `file(1)`: `SKILL.md` = UTF-8 text, `LICENSE.txt` =
  ASCII text.
- Dangerous-pattern grep over `SKILL.md` (`curl|wget|http://|https://|bash |sh -c|eval|exec|npm |pip |install`):
  the single hit was the substring `exec` inside the English word "execution"
  (`SKILL.md:25`). No network calls, no shell, no package installs.

## Skills deliberately NOT vendored (already present as built-ins)

Checked on 2026-08-07 — these exist in the runtime skill directories, so
vendoring the upstream copies into `.claude/skills/` would create a **name
collision** with a built-in of the same name:

| skill | already available at |
|---|---|
| `xlsx` | `/root/.claude/skills/xlsx`, `/mnt/skills/public/xlsx` |
| `docx` | `/root/.claude/skills/docx` |
| `pdf` | `/root/.claude/skills/pdf` |
| `mcp-builder` | `/root/.claude/skills/mcp-builder` |

`frontend-design` was **not** present in `/root/.claude/skills/` — that is why
it is the one skill vendored here.

## Upstream disclaimer (verbatim intent)

The upstream README marks these skills as "provided for demonstration and
educational purposes only" and warns that Claude's actual behaviour may differ.
Treat `frontend-design` as guidance, not as a repo rule: where it disagrees with
`.claude/skills/gacp-design-tokens` or `.claude/skills/thai-ui-copy`, the
repo-local skills win.
