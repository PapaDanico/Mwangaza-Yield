# Spec: publish each figure's route in the rates feed

Status: proposal, nothing built. Needs the owner's go-ahead because it changes the
published feed and, downstream, JiPange's snapshot.

## Why

Mwangaza already records how every hand-maintained figure arrived (`via` in
`tbills.json` and `macro.json`) and shows it as the route badge
(`src/lib/figure-route.ts`, `ProvenanceBadge`). The public feed
(`public/data/rates.json`, built by `scripts/build-rates-feed.mjs`) drops it, so a
consumer cannot tell a transcribed CBK notice from a search-corroborated figure.
JiPange's snapshot has zero `via` fields, so it cannot show a true badge and must
not invent one.

## Change (additive, schema stays 1)

1. **Mwangaza, feed builder.** Add an optional `via` string to each `tbills[]`
   entry and to each `macro.*` entry, copied from the source row `pickMacro` and
   the T-bill mapper already select. Omit the key when the row has none; never
   write `null` or a default. Keep `schema: 1`: `pipelineRanAt` was added the same
   way and consumers that ignore unknown keys are unaffected.
2. **Mwangaza, contract test.** Extend `feed-contract-published.test.ts`: every
   emitted `via` is a key of `ROUTES` in `figure-route.ts`; a row without one
   emits no key. Document the field in `docs/RATES-FEED.md`.
3. **JiPange, sync script.** `scripts/sync-rates.mjs` carries `via` through only
   if it is one of the four known routes (`supplied-document`,
   `search-corroborated`, `imf-weo`, `cbk-home`); an unknown value is dropped and
   reported, not refused, so a new upstream route cannot block a rate update.
   Before relying on this, confirm how the script treats unknown keys today (not
   verified here). The snapshot is still written only by the script.
4. **JiPange, UI.** A small badge beside the provenance line, rendered only when
   `via` is present; absent shows nothing. Word plus icon, never colour alone,
   using existing tokens. Add one line to `web/DESIGN.md`.

## Guards

- Absence is not a route: no default, no inference from `source` text.
- Verify the live route list at build time against `ROUTES`, so a route added
  upstream without a label fails the Mwangaza test, not a reader.
- JiPange test: a snapshot with an unknown `via` loses only that field.

## Order and cost

Mwangaza first (feed + test; `src/` and `scripts/` paths, so a real deploy), then
a hand-sync or the next scheduled sync in JiPange, then the badge. Each step is
independently revertable. Do not start step 3 before step 1 is published and
fetched from the live feed.
