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

## The three lockups — `source-*.png` here, web copies in `public/brand/`

Supplied 14 August 2026 after the sheet below was found to document three
lockups that existed as no file. These are the originals, untouched. What the
site can actually use lives in `public/brand/` as WebP.

They needed work before they were usable, and the reasons are worth keeping:

**No transparency.** All three arrived RGB with a baked backdrop — white behind
the horizontal lockup and the mark, navy behind the inverse. The site's card
surface is `#FDFBF5`, so a white-backed logo would have shown a faintly wrong
rectangle: near enough to look intentional, far enough to look grubby. Each
backdrop was flat (sampled across nine points, channel variance 0–2), so it
keyed cleanly.

**Mostly padding.** The lockups were 1536×1152 with the artwork occupying
1204×346 — about 23% of the canvas — and not centred (378px above, 430px
below). Dropped into a fixed-height box that renders the logo at roughly a
quarter of the space it appears to occupy. Cropped to the artwork with 10px of
breathing room.

**Heavy.** 2.3MB across three PNGs. The WebP copies are 132KB for all three.
That matters for the reader this project is for.

Keyed with a dead-zone and a ramp rather than a hard threshold: a hard cut
stair-steps edges that were anti-aliased against the backdrop, and the usual
`255 - min(channel)` shortcut would have made the gold semi-transparent,
because gold's blue channel is 28. Each result was composited back over the
real surface it will sit on — cream for two, `#05172C` footer navy for the
inverse — and checked for haloing.

### Two questions this raised, and how they were settled

Both were put to the owner and decided on 14 August 2026. Recorded here because
each will look like an inconsistency to the next person, and the answer in both
cases is that it is deliberate.

**Circle versus rounded square — the site keeps the rounded square.**

`public/logo.svg` and `public/favicon.svg` draw `rect ... rx=112`, while both
brand sheets and `source-mark.png` show a circle. The site is the odd one out,
and it stays that way on purpose.

The reason is how icons are consumed rather than how they look in isolation.
iOS and Android apply their OWN mask to whatever they are given — a squircle,
or an adaptive shape the user's launcher picks. Supply a circle and the
platform masks a circle inside its own outline: a small disc, visibly inset,
floating on a background nobody chose. A full-bleed rounded square masks
correctly everywhere. It also carries about 27% more area at the same bounding
box, which is the whole argument at 16px.

So the circle is not rejected — it is the badge, for standalone use at sizes
where a disc reads as a disc. `public/brand/mark.webp` is that. The rounded
square is the icon source. Two shapes, two jobs, and this paragraph exists so
that is not mistaken for drift.

**Green versus gold dot — gold.**

`source-mark.png` and `app-icon-3d-500.png` end the curve in green; both
lockups and `logo.svg` end it in gold. Gold wins on three counts, and the third
is the one that decides it:

1. It is the majority of the supplied artwork — both lockups use it.
2. It is what already ships, so the answer costs nothing to implement.
3. **Green is already load-bearing elsewhere in this product.** On the yield
   curve, `#059669` is the infrastructure-bond series — the tax-free one. A
   green dot in the mark would put that signal in the one element that appears
   on every page, quietly implying a meaning the logo does not have.

Neither answer changes a shipped file. That is the point: the site was already
correct, and what was missing was the larger-format artwork it never had.

The navy, at least, agrees: the mark samples `#051832` against the site's
`#05172C`, the same colour within compression noise. An earlier reading of
`#00122B` was the inverse lockup's *backdrop*, not the mark.

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
