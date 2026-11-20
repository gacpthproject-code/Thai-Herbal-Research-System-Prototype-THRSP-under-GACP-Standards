---
name: gacp-design-tokens
description: GACP design-token discipline for any UI change in apps/web-app. Use when adding or editing Tailwind classes, colors, spacing, or components.
---

# GACP Design Token Discipline

Canonical sources: `apps/web-app/src/styles/globals.css` (`:root` + `.dark` token sets),
`apps/web-app/tailwind.config.cjs` (token → utility mapping), `DESIGN.md`,
`docs/audit-reports/2026-07-23-jobs-bar-quality-audit.md` (incidents cited below).

## Color

- Action green is the **leaf** token set, never stock `emerald-*`.
  **Contrast contract (W3-B):** text-bearing solid buttons use `bg-leaf-700`
  (#18803f, 5.0:1 under white), hover/pressed `bg-leaf-800` (#146333, 7.3:1),
  disabled `bg-leaf-300`. Bare `bg-leaf` (#34b56a, 2.64:1) and `bg-leaf-600`
  (3.57:1) FAIL WCAG AA with white text — decorative fills, icons and borders
  only. On-light text `text-leaf-700`, soft fill `bg-leaf-soft` (carries
  leaf-700 text at 4.6:1), shadows `shadow-leaf-btn` / `shadow-leaf-card`.
  Deep forest `primary` stays for text, links, depth, footers.
- The gold `accent` token pairs with `accent-foreground` = deep bronze
  (43 100% 10%), NOT white — white on the gold was 2.43:1 (axe serious).
- Neutrals come from the token set: `text-foreground`, `text-muted-foreground`,
  `bg-muted`, `bg-card`. Do not introduce `zinc-*`/`slate-*` in new code; existing
  `dark:bg-zinc-900` patches are legacy remediation, not the pattern to copy.

## Surfaces and dark mode

- Surfaces use `bg-card` - it flips automatically (`--card: 0 0% 100%` in `:root`,
  `150 20% 9%` in `.dark`). Same for `text-card-foreground`.
- Bare `bg-white` requires an explicit `dark:` override AND a comment explaining why.
  Incident: ~191 `bg-white` spots without `dark:` (including Button variants,
  `(marketing)/page.tsx`) made landing/pricing unreadable when dark mode toggled.
- A new tinted surface is an RGB-triple token in `globals.css` with a value in both `:root`
  and `.dark`, read as `rgb(var(--x) / <alpha-value>)`. No raw hex. Define its text colour
  as a pair (`--leaf-soft` with `--leaf-on-soft`, exposed as `leaf-soft` / `leaf-onSoft`).
- Before changing padding or background of an input, read `.field-emphasis`
  (`globals-components-layout.css`) and `.gov-auth-input` (`globals-components-auth.css`).
  `.field-emphasis` sets `border-radius`, `background` and `border` with `!important`;
  its `padding` is unset and its `font-size`, `color` and `transition` are plain, so a
  utility wins there. `.gov-auth-input` sets every property with `!important`, including
  `padding`, `background`, `color` and `height`, so no utility changes them (memory
  `dark-mode-flips-text-not-surfaces`).
- After a CSS change run `bash scripts/probes/themed-surface-tokens.sh` (it reads every file
  under `src/styles/`).

## Consuming CSS variables (get the wrapper right)

- HSL-triple tokens (`--border: 150 12% 85%`) MUST be consumed as `hsl(var(--token))`.
  Incident (auth CSS): `globals-components-auth.css` shipped
  `border: 1px solid 150 12% 85%` - invalid CSS - so register/login
  outline buttons rendered borderless and transparent (~20 call sites).
- RGB-triple tokens (`--hero-shadow: 0 103 56`) use `rgb(var(--x) / alpha)`,
  e.g. `rgb(var(--hero-shadow) / 0.5)` in `globals-components-layout.css:16`.
- Alpha goes in the wrapper (`hsl(var(--border) / 0.5)`), never baked into the token.

## Radius, elevation, primitives

- Radius comes from the token scale: `--radius: 0.75rem`, mapped to `rounded-lg`
  (`borderRadius.lg: 'var(--radius)'` in `tailwind.config.cjs`). No hard-coded radii
  and no `!important` stomps - the audit found the token system overridden with
  `!important` blocks in `globals-components-auth.css` (e.g. `border-radius: 0.75rem
  !important; background: #fff !important`). Do not add more; remove when touched.
- Buttons, badges, cards, dialogs come from `src/components/ui/primitives/`
  (`button.tsx`, `badge.tsx`, `card.tsx`, `status-badge.tsx`, `dialog.tsx`, ...).
  Never re-style them ad hoc. In particular, use the Dialog primitive (focus trap,
  Escape, initial focus built in) - the audit found 10 hand-rolled `aria-modal` divs
  bypassing it with no focus management.
- A dialog never grows past the screen: `DialogContent` is bounded and scrolls
  (`max-h-[calc(100dvh-2rem)] overflow-y-auto`). Do not pass it `overflow-hidden` or a
  taller `max-h`: `cn` (tailwind-merge) keeps the caller's class, the scroll is gone, and
  the buttons at the bottom fall off the screen once reasons or a contact appear (the
  dispatcher's booking dialog, 2026-10-10). A hand-rolled modal needs the same two classes.
  `apps/web-app/playwright/dispatcher-dialogs-reachable.spec.ts` checks the dispatcher's
  dialogs at 1440x900 and 390x844.
- No card inside a card; shadows respond to state only (`DESIGN.md` elevation rules).

## Accessibility non-negotiables

- Keyboard focus stays visible: the global `*:focus-visible` ring
  (`outline: 2px solid hsl(var(--ring))` in `globals.css`) must not be suppressed;
  never `outline: none` without an equivalent visible replacement.
- Respect `prefers-reduced-motion`: `globals.css` zeroes animation/transition
  durations under `reduce`; framer-motion usage must go through
  `<MotionConfig reducedMotion="user">`. State on 2026-11-03: 13 non-test files import
  framer-motion and none uses `MotionConfig` or `useReducedMotion`. That is debt, not a
  pattern to copy: wrap any such file you touch in the same change.
- Status is never conveyed by color alone - pair with text or icon (`DESIGN.md`).

## Platform identity

- `primary` is #006633 (`--primary: 153 100% 20%`), paired with the gold `accent`. The font
  is `font-sans` (Sukhumvit Set, then Sarabun); do not add a font. Design work outside the
  app (artifacts, mockups) uses #006633 + gold + Sarabun.
- No emoji and no pictures standing in for words, on screen or in design deliverables: this
  is a government platform (memory `no-emoji-in-design-deliverables`). Plain Thai words;
  typographic marks such as ✓ and · are fine.
- The ministry seal (`gacpthai-logo.png`) goes on the certificate and the platform's auth and
  public header; the company logo (`company-logo.png`) goes on commercial papers only. Never
  swap them (memories `dtam-logo-authorized-for-auth-page`, `two-logos-two-issuers`).

## Checklist before shipping a UI change

1. No `emerald-*`, `zinc-*`, `slate-*` in new code; leaf + token neutrals only. Legacy code
   still has 778 such lines (2026-11-03); do not copy them.
2. No bare `bg-white` without `dark:` + reason; prefer `bg-card`.
3. Every `var(--x)` consumption wrapped in the correct `hsl()`/`rgb()` form.
4. Radius/shadows from tokens; no new `!important`.
5. Interactive elements are primitives from `src/components/ui/primitives/`.
6. Tab through the change: focus ring visible on every interactive element.
7. `pnpm lint` in `apps/web-app` passes (`--max-warnings=0`; `gacp/no-raw-color` and
   `gacp/no-thai-letterspacing` are errors).
8. Measure again after the change reaches staging: axe on every touched route in light and
   dark, plus the computed style of each colour pair you changed. The file is not the
   evidence; budget 4-5 rounds (memory `measure-after-deploy-not-after-edit`).
