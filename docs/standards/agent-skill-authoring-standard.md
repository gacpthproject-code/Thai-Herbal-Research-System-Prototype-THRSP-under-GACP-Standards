# Agent Skill Authoring Standard

This standard adapts the strongest parts of `blader/humanizer` for repo-local skills in GACP.

## Core Rules

- Keep `SKILL.md` as the runtime source of truth.
- Write directly. Remove filler, praise, and vague framing.
- Prefer observable signals over abstract advice.
- Show examples when a rule can be interpreted in more than one way.
- Declare process, validation, and output contract explicitly.
- Keep large reference material outside the main body unless it is needed on every run.

## Recommended Folder Shape

```text
skill-name/
  SKILL.md
  references/
    domain-map.md
    commands.md
  scripts/
    helper.js
```

## Frontmatter Rules

- `name`: lowercase, hyphenated, short.
- `description`: include both the action and the trigger conditions.
- Keep frontmatter minimal. Do not hide trigger logic in the body.

## Default Skill Layout

Use this order by default:

1. Objective
2. Read first
3. Inputs to collect
4. Signals and routing rules
5. Process
6. Validation
7. Output format
8. Escalation rules

## Copy-Ready `SKILL.md` Starter

```md
---
name: skill-name
description: Do X for Y. Use when work touches A, B, or C, or when the user asks for D.
---

# Skill title

## Objective

State the job in one paragraph. Name the repo surface, risk, and expected result.

## Read First

- `path/to/canonical-doc.md`
- `path/to/workflow.md`
- `path/to/reference.md`

## Inputs To Collect

- actor or portal
- affected path or service
- risk area
- desired output

## Signals And Routing Rules

### [Rule name]

Signals:
- concrete trigger 1
- concrete trigger 2

Why it matters:
- one short reason

Action:
- what to do

Bad:
> vague or risky behavior

Good:
> concrete, bounded behavior

## Process

1. Inspect the impacted paths first.
2. Confirm the canonical contract and constraints.
3. Execute the smallest safe change or audit.
4. Run the required verification commands.
5. Return evidence, risks, and next actions.

## Validation

- command 1
- command 2
- artifact or report path

## Output Format

- Scope
- Owners
- Commands run
- Findings or changes
- Risks
- Evidence paths

## Escalate When

- the target is production
- the workflow is mutating and a safe target is not confirmed
- identity, payment, or workflow state can be corrupted
```

## Rule Block Template

Use this when behavior-level guidance is needed:

```md
### [Pattern or failure mode]

Signals:
- what you can see in code, docs, or runtime

Why it matters:
- the actual consequence

Action:
- the default move

Bad:
> what not to do

Good:
> what correct handling looks like
```

## GACP-Specific Additions

Every skill in this repo should name:

- actor: health, provider, admin, public, or partner
- surface: frontend, backend, infra, auth, workflow, database, MIS, or integration
- canonical source: the file or doc that wins when conflicts exist
- verification mode: static, dynamic, or release

## Review Checklist

- Can another agent trigger this skill from the description alone?
- Does the body tell the agent what to read first?
- Are the routing rules tied to real paths in this repo?
- Are validation commands current and executable?
- Is the output format specific enough for handoff?
