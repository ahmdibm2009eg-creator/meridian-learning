# Accessibility Standard (Meridian)

Target: **WCAG 2.2 AA across all workflows, AAA where practical** (high-contrast theme).
This is a release gate: no feature ships if its essential workflow is inaccessible.

## Built into the design system

- **Text**: 18px base (`html { font-size: 112.5% }`), user-scalable 85–160% via the preferences panel; reading content renders at 1.1rem+.
- **Contrast**: Light/dark/high-contrast token sets. The `hc` theme is black-on-white with 4px focus outlines (AAA body text). Status colours are always paired with icons and words — never colour alone.
- **Focus**: `:focus-visible { outline: 3px solid var(--focus) }` on every interactive element; skip link to `#main-content`; dialogs return focus (Radix).
- **Targets**: ≥44px for all primary actions, options, nav items, navigator cells.
- **Motion**: `data-motion="reduced"` + `prefers-reduced-motion` both collapse animations.
- **Layout**: no horizontal scrolling at 320px (mobile-verified); logical CSS properties (`ms-`/`me-`, `border-s/e`) so RTL mirrors correctly; reading width capped in `--a11y-reading-width`.

## Personal preferences (persisted per account)

Text size · line height · letter spacing · typeface (default/dyslexia-friendly Verdana stack/serif) ·
reading width · light/dark/high-contrast · reduced motion · simplified interface · focus mode ·
reading ruler (pointer-following guide) · paragraph highlight · underline-links · reading progress bar ·
read-aloud (Web Speech API) · language EN/AR.

## Question-type accessibility strategies

| Type | Strategy |
|---|---|
| MCQ single/multi | `role=radio/checkbox` buttons with `aria-checked`, letter labels, eliminate toggles are separate `aria-pressed` buttons (works without drag or hover) |
| True/False | Radio group |
| Short answer / numeric / essay | Labelled inputs; numeric uses `inputMode=decimal` |
| Matching | Each pair is a labelled `<select>` — fully keyboard-operable, no drag |
| Ordering | Numbered list with ↑/↓ move buttons + `aria-label` per item (drag-free by design) |
| Fill-blank | Inline labelled inputs at each `{{n}}` placeholder, auto-sizing |
| Passages | Dual-pane on wide screens, stacked on narrow; same DOM order for screen readers |
| Exams | Navigator cells announce answered/flagged state; timer is `role=timer` (non-polite, no announcement spam); submit dialog lists unanswered questions as links |

## Verified in this build

- Accessibility-tree inspection of every core screen (roles, labels, states) during end-to-end testing
- Full keyboard path: login → dashboard → practice → answer → check → next; exam start → answer → flag → eliminate → navigate → submit
- RTL Arabic pass: `dir=rtl` + translated UI, nav, and controls
- Mobile 390px pass: stacked layout, hamburger nav, no overflow

## Known gaps (honest)

- Automated axe-core scans are not yet wired into a test runner (manual tree verification only)
- Reading ruler requires a pointer (no keyboard equivalent yet)
- Web Speech API availability depends on the browser (feature-detected with graceful message)
