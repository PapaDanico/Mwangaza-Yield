# Brand source assets

Source artwork. **Nothing in this directory is served.** The site renders from
`public/`, and these files are here so the originals are findable when someone
needs to produce a new size, a new format, or a vector.

Both arrived at the repository root on 14 August 2026 with generated filenames
(`3OfxYWMMud9d3tM7aRO7D.png`, `FM_rwXxwyKHVUtHBHmDyW.png`). A hashed name tells
the next person nothing, and the root is not a location Next.js serves, so they
were inert where they landed. Renamed and moved here.

## `app-icon-3d-500.png` — 500×500

A dimensional treatment of the mark: the gold sail on the navy rounded square,
with a yield curve rising through gold dots to a green endpoint, plus gloss and
an outer glow.

**This is not the mark the site renders, and that is deliberate.** `public/logo.svg`
is a flat vector and stays the live logo, for a reason that is about size rather
than taste: a favicon is 16px. At 16px the curve's dots are sub-pixel, the glow
becomes a smear, and the drop shadow reads as blur. The flat vector holds its
shape all the way down; this render does not, and was clearly drawn for the
sizes an app icon actually appears at.

If it is ever wanted for `apple-touch-icon.png` (180px) or PWA install icons,
that is the range it suits. Check it at the target size first — the point of
the paragraph above is that this artwork has a floor.

## `brand-sheet-2026-08.png`

A specification, not an asset. It documents three lockups:

1. **Full horizontal** — mark, wordmark, and the tagline *"Intelligence Layer
   for Kenya's Bond Market"*
2. **Standalone square mark** — labelled for icon and favicon use
3. **Inverse lockup** — white on navy

None of the three exists as a separate file. Anyone needing one has to cut it
from this sheet or rebuild it, and the sheet is a raster, so cutting loses
quality. Worth requesting as individual files if a lockup is ever needed.

There is precedent for the harder path: the comment at the top of
`public/logo.svg` records that it was traced from an earlier PNG-only brand
sheet supplied 31 July 2026, with the geometry measured off the source rather
than eyeballed. That is what producing a vector from a sheet costs here.
