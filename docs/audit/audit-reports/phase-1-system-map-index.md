# Phase 1 System Map Index

This index consolidates the Phase 1 runtime mapping set.

Rules for this phase:
- runtime-first, code-backed mapping
- no remediation proposals
- use mounted routes and active runtime behavior over historical docs where they differ

## Recommended reading order

1. `docs/canonical-inventory.md`
2. `docs/flow-runtime-matrix.md`
3. `docs/entity-runtime-matrix.md`
4. `docs/dependency-integration-matrix.md`
5. `docs/auth-role-boundary-matrix.md`
6. `docs/consumer-surface-matrix.md`
7. `docs/surface-mount-precedence-map.md`
8. `docs/runtime-drift-register.md`
9. `docs/vocabulary-source-of-truth-map.md`

## Document map

| Document | Primary question it answers | Best used when | Main output type |
| --- | --- | --- | --- |
| `docs/canonical-inventory.md` | What route namespaces and modules exist in runtime? | starting from repo shape and mounted surfaces | namespace inventory |
| `docs/flow-runtime-matrix.md` | What are the major user, provider, admin, public, and system flows? | tracing end-to-end movement across apps and APIs | flow matrix |
| `docs/entity-runtime-matrix.md` | Which entities are touched by which actors and jobs? | checking ownership, exposure, and async touch points | entity ownership matrix |
| `docs/dependency-integration-matrix.md` | What infra and integrations does runtime depend on? | mapping network, storage, queues, webhooks, and support systems | dependency matrix |
| `docs/auth-role-boundary-matrix.md` | Where are auth and role boundaries defined? | checking cookies, tokens, middleware, and role gates | auth and RBAC boundary map |
| `docs/consumer-surface-matrix.md` | Which app or public consumer calls which runtime surfaces? | mapping web, mobile, public, and bridge consumers to APIs | consumer-to-surface matrix |
| `docs/surface-mount-precedence-map.md` | Which path wins when route surfaces overlap? | resolving nginx, Next, Express, and mount-order ambiguity | precedence map |
| `docs/runtime-drift-register.md` | Where do code, docs, and layers disagree? | risk review and drift triage | drift register |
| `docs/vocabulary-source-of-truth-map.md` | Which names are canonical and which are aliases or collisions? | terminology review across backend, web, mobile, and docs | vocabulary and source-of-truth map |

## Coverage by topic

| Topic | Primary doc | Supporting docs |
| --- | --- | --- |
| modules and namespaces | `docs/canonical-inventory.md` | `docs/surface-mount-precedence-map.md`, `docs/runtime-drift-register.md` |
| routes and mounts | `docs/canonical-inventory.md` | `docs/surface-mount-precedence-map.md`, `docs/auth-role-boundary-matrix.md` |
| roles and auth | `docs/auth-role-boundary-matrix.md` | `docs/runtime-drift-register.md`, `docs/vocabulary-source-of-truth-map.md` |
| entities | `docs/entity-runtime-matrix.md` | `docs/flow-runtime-matrix.md`, `docs/canonical-inventory.md` |
| major flows | `docs/flow-runtime-matrix.md` | `docs/surface-mount-precedence-map.md`, `docs/entity-runtime-matrix.md` |
| dependencies and integrations | `docs/dependency-integration-matrix.md` | `docs/flow-runtime-matrix.md` |
| consumer apps and bridge layers | `docs/consumer-surface-matrix.md` | `docs/auth-role-boundary-matrix.md`, `docs/surface-mount-precedence-map.md`, `docs/dependency-integration-matrix.md` |
| terminology and naming | `docs/vocabulary-source-of-truth-map.md` | `docs/runtime-drift-register.md`, `docs/canonical-inventory.md` |
| runtime drift and early risk | `docs/runtime-drift-register.md` | all other Phase 1 docs |

## Fast entry points by question

| If the question is... | Open this first |
| --- | --- |
| "What is actually mounted?" | `docs/canonical-inventory.md` |
| "Why does this path resolve here?" | `docs/surface-mount-precedence-map.md` |
| "Who can access this surface?" | `docs/auth-role-boundary-matrix.md` |
| "Which entity is canonical for this flow?" | `docs/entity-runtime-matrix.md` |
| "What depends on Redis, MinIO, queues, or webhooks?" | `docs/dependency-integration-matrix.md` |
| "Which app or public client consumes this endpoint family?" | `docs/consumer-surface-matrix.md` |
| "Where are naming collisions still active?" | `docs/vocabulary-source-of-truth-map.md` |
| "Where do layers disagree right now?" | `docs/runtime-drift-register.md` |

## Current high-signal themes across the set

- Mounted runtime is more reliable than historical OpenAPI or deprecation text when identifying live API shape.
- Identity vocabulary is more canonical than payload vocabulary.
- Backend role normalization is broader than web and mobile role language.
- `farm` versus `establishment` is the strongest business-domain naming collision.
- Public verification is split between traceability language and trust/interoperability language.
- Mobile contains both Applicant-first and provider/PROVIDER-first vocabulary at the same time.

## Phase boundary

This index and the linked documents stay within Phase 1:
- system map
- route and actor inventory
- dependency and entity mapping
- early drift and risk capture

This set does not include:
- remediation design
- migration plan
- implementation proposal
- sequencing of fixes
