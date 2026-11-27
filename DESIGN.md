# Mwangaza Yield Design System

The look is **precise institutional ledger**: cream and khaki paper, treasury-navy
ink, one gold signal, mint for gains, and a single dark "ticket" per page.
Tokens live in `tailwind.config.js`; change values there, never inline.

This file records what is already shipped. It introduces no new colour, font or
token. Sister product: JiPange (`web/DESIGN.md` in PapaDanico/JiPange) is the
warm editorial counterpart; the shared rules are under "One house" below.

## Typography

| Role | Face | Applied via |
| --- | --- | --- |
| Display and UI | Plus Jakarta Sans | `font-display` / `font-sans` (`--font-jakarta`) |
| Figures, codes, tabular data | JetBrains Mono (400, 600) | `font-mono` (`--font-jetbrains`) |

Both load through `next/font/google` in `src/app/layout.tsx`. Display and body
share one family on purpose: authority here comes from the navy ink and the
mono figures, not from a serif. Do not add a display serif; JiPange owns that
voice.

## Colour tokens

- **Ground**: `sand-100` page, `sand-50` card, `sand-200` recessed, `sand-300`
  border, `sand-400` strong border.
- **Ink** (text tiers): `ink` `#0A192F` -> `ink-soft` -> `ink-muted` -> `ink-faint`.
  Muted and faint are contrast-checked against the darkest surface they land
  on (sand-200), not the lightest. Keep that rule when adjusting them.
- **Brand**: `treasury.navy` `#0A192F`, `treasury.dark` `#020C1B` (ticket).
- **Gold** (signal and caution): a complete 50-900 ramp. It is complete on
  purpose: Tailwind emits nothing for an undefined step, so a missing one
  renders with no colour and no error. `tests/unit/palette.test.ts` fails on an
  undefined step. Mint is only 300/500/600/700/800; do not use a step outside
  that list.
- **Mint** (gain, confirmation): small text uses `mint-800`.

## Elevation and the ticket

Shadows are navy-tinted, not grey (`card`, `card-hover`, `ticket` in
`boxShadow`). Each page gets at most one dark, raised surface: the yield
"ticket" (`bg-treasury-dark` + `shadow-ticket`). It changes the surface only;
figures, dates and labels still come from the data. Gold-400 (11.75:1) and
mint-300 (12.86:1) are the figure colours on it.

## Figures

Money, yields and prices use `font-mono` with tabular numerals so digits
align. Every figure shown from a feed carries its publisher and date
(see "One house").

## One house (shared with JiPange)

Rules both products follow so they read as one family:

1. **Paper ground**: a warm off-white page with white-ish cards; never cool grey.
2. **One warm signal**: amber/gold marks emphasis and caution. Mint/green is
   gain only; red is a fault only.
3. **Tinted elevation**: shadows take the product's ink, never neutral grey.
4. **One dark surface per page** (passbook in JiPange, ticket here).
5. **Text tiers**: ink -> soft -> muted -> faint, AA on every surface they land on.
6. **Provenance line**: see below. A figure without publisher and date is a defect.

### Provenance line

A small mono, tabular line under or beside a feed-derived figure:
`PUBLISHER · DATE`. It renders strings and flags the data layer already
produces; it computes nothing. State is shown by colour AND a word, never
colour alone:

| State | Text | Mark | Contrast (measured) |
| --- | --- | --- | --- |
| Current | `ink-muted` | none | 5.46 on sand-50 |
| Aging (past its cadence, still usable) | `gold-800` on `gold-100` | word "check" | 6.37 |
| Stale / fallback | `red-800` on `red-50` | word "stale" | 7.60 |
| Current, positive reading | `mint-800` | none | 7.43 on sand-50, 6.88 on sand-100 |

The existing `PriceProvenance` badge (`info.stale` -> "· check") is the Aging
state already; align new uses to this table rather than inventing another.
Freshness is derived from each dataset's own cadence in the data, never from a
hand-set date.

## Radius

No radius tokens exist; components use Tailwind's defaults. Counts of use in
`src/**/*.tsx` when this was written: `rounded-xl` 120 (cards, panels),
`rounded-lg` 88 (controls, inputs), `rounded-full` 54 (pills, badges),
`rounded-2xl` 41 (hero and ticket surfaces), then `rounded` 16, `rounded-md` 13.
Follow the dominant pairing (xl card, lg control, full pill) rather than adding
a new step.

## Motion

There are no custom keyframes or animation tokens. Motion is:

- **Link cards**: `.card-link` in `globals.css`, a 200ms ease-out 2px lift with
  the `card-hover` shadow and a `gold-500` border.
- **Loading**: `animate-pulse` on the `DataState` skeleton only.
- **Reduced motion**: a global `prefers-reduced-motion: reduce` rule in
  `globals.css` collapses every animation and transition to 0.01ms. Never add
  motion that bypasses it.

There is no shared entrance animation (JiPange has `animate-rise`). Adding one
would be a deliberate family-alignment decision, not a gap to fill silently.

## Iconography

`lucide-react` (59 files import it), used at small sizes with `aria-hidden` and
the meaning carried by an `sr-only` label. This differs from JiPange, which
hand-inlines 24-unit stroke SVGs and ships no icon library; each product keeps
its own approach.

`ProvenanceBadge` already exists: a shield for a figure read from the primary
document (`emerald-800`, same hex as `mint-800`) and a magnifier for one
corroborated by search (`gold-800`), icon-only below `sm`. It marks the
*route* a figure arrived by, which is distinct from the freshness states
above; the two can sit together.

## Loading and empty states

`DataState` renders a skeleton card (`animate-pulse`, `aria-busy`, labelled
"Loading ...") at a reserved height. Pass `reserve` to match the real tool's
height: the `h-64` default caused layout shift on four routes, which is why
`reserve` exists. Reserve a little over one viewport, not the final height.

## PWA

`public/manifest.json` sets `background_color` and `theme_color` to `#F7F2E7`
(`sand-100`); keep them equal to the page ground. Icons are generated by
`npm run build:icons` (`scripts/generate-icons.js`).

## The card utility

`.card` in `globals.css` is `bg-sand-50 rounded-2xl border border-sand-300 p-5
shadow-card`. Use it for every resting panel; do not rebuild it from utilities.
`.card-link` (see Motion) adds the hover lift for cards that are links. In
print, `.card` loses its shadow and avoids page breaks.

## Figures and keyboard focus

- `.num` sets `font-mono tabular-nums` with slashed zeros (`zero` feature), so 0
  and O cannot be misread in a yield, price or date. Prefer it for any figure.
- Focus is one global rule on `a, button, input, select, textarea, summary,
  [tabindex]`: a 3px `ink` outline, 2px offset, plus a `sand-50` inner ring, so
  it reads on both light and dark surfaces. Never remove an outline or add a
  one-off focus colour.
- Range sliders are styled globally: a quiet track and a 22px `sand-50` thumb
  with a `gold-600` ring, in a 28px hit area (above the 24px WCAG 2.5.8 floor).

## Form controls

There is no shared input class: 54 inputs and 17 selects carry their own
utilities. The dominant pairing is `bg-sand-50`, `border-sand-300` (`sand-400`
for emphasis) and `rounded-lg`/`rounded-xl`, consistent with the Radius rule.
Focus comes from the global rule, so do not add `focus:` styles. Extracting one
control class would be a deliberate consolidation, not a gap to fill silently.

## Empty and error states

`DataState` owns the no-data case. Online it says "No <label> to show yet";
offline it says "We could not reach the <label> data" and explains that the tool
works without a network once loaded once. It offers a next step, never a bare
grey box. Domain empties say what is missing and why, in plain words (for
example "Nothing recorded yet" in `GoalProgress`, "Not enough auctions carry a
published clearing rate" in `CurveHistory`). Never show a placeholder figure.
