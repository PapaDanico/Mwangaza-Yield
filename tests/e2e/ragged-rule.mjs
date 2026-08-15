/**
 * THE RAGGED-STACK RULE, AS ONE DEFINITION.
 *
 * This lived inline inside smoke.mjs's layout sweep. Moving it here is not
 * tidying: the sweep runs against whatever shapes the site happens to contain
 * today, so when no page has a ragged stack it passes whether the rule is
 * correct, subtly wrong, or deleted. Cases pin the rule itself — but only if
 * they exercise THE rule rather than a copy of it, which is why this is a
 * single exported string that both the sweep and ragged-cases.mjs evaluate.
 *
 * A copy would be worse than nothing here. The sister project's version of
 * this guard went silently blind precisely because two repos held drifting
 * copies of one rule, and this file exists so that a change to the check fails
 * its cases instead of quietly diverging.
 *
 * It is a string because it is evaluated inside the browser, where the layout
 * facts are.
 *
 * WHAT THE RULE SAYS, AND WHY EACH CLAUSE IS THERE
 *
 * Both of this rule's bugs were found by accident on the real site, and
 * neither would have been caught by the sweep going green:
 *
 *   - Matching every <a> over 32px counted padded TEXT LINKS as buttons. The
 *     footer's link column — "CBK on WhatsApp" / "Pesa Smart KE" /
 *     "Contact us" at 149/132/110px — flagged on all 22 routes at 768px.
 *     Ragged left-aligned links are what a list of links is supposed to look
 *     like; forcing them to a common width would be the defect. So the
 *     discriminator is whether an item is PAINTED — carries a background or a
 *     visible border, and therefore draws a right edge that can mismatch —
 *     rather than exempting <footer> by name.
 *
 *   - Filtering children BEFORE reading row structure invents stacks.
 *     /ladder/ renders [Download PDF] then [Save image + Print], which is
 *     flush; Print draws no border, so dropping it first left two items
 *     looking like a ragged 358/180 stack. Row structure is a fact about the
 *     layout; the painted test is about which mismatches are worth reporting.
 *     They must happen in that order.
 */
export const RAGGED_RULE = `(wrap) => {
  const clear = (v) => !v || /rgba\\(0, 0, 0, 0\\)|transparent/.test(v);
  const all = [...wrap.children].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.height >= 8 && getComputedStyle(e).display !== 'none';
  });
  const rowOf = new Map();
  for (const e of all) {
    const t = Math.round(e.getBoundingClientRect().top);
    rowOf.set(t, (rowOf.get(t) || 0) + 1);
  }
  const kids = all.filter((e) => {
    if (e.tagName !== 'A' && e.tagName !== 'BUTTON') return false;
    const r = e.getBoundingClientRect();
    if (r.height < 32 || r.width <= 40) return false;
    const cs = getComputedStyle(e);
    return (!clear(cs.backgroundColor)) ||
      (parseFloat(cs.borderTopWidth) > 0 && !clear(cs.borderTopColor));
  });
  if (kids.length < 2) return null;
  const lone = kids.filter((k) => rowOf.get(Math.round(k.getBoundingClientRect().top)) === 1);
  if (lone.length < 2) return null;
  const boxes = lone.map((k) => k.getBoundingClientRect());
  if (!boxes.every((b, i) => i === 0 || b.top >= boxes[i - 1].bottom - 2)) return null;
  const widths = boxes.map((b) => Math.round(b.width));
  const spread = Math.max(...widths) - Math.min(...widths);
  return spread > 2 ? widths.join('/') : null;
}`;

/**
 * The cases, shared with the sister project so the two cannot drift.
 *
 * These hard-code widths and borders rather than using the app's classes: the
 * point is to pin the CHECK, not the design tokens.
 *
 * box-sizing matters. With the default content-box a 1px border each side
 * makes width:160px measure 162px, and the first run of these fixtures
 * "failed" purely because the expected numbers were written as the declared
 * widths rather than the rendered ones. The rule was right and the cases were
 * wrong — recorded so the next reader is not misled the same way.
 */
export const PAINTED = 'box-sizing:border-box;border:1px solid #333;display:block;height:40px;';
export const BARE = 'box-sizing:border-box;display:block;height:40px;';

export const RAGGED_CASES = [
  {
    name: 'painted chips stacked at different widths — the defect',
    html: `<div id="w"><a href="#" style="${PAINTED}width:160px">A</a>
           <a href="#" style="${PAINTED}width:220px">B</a></div>`,
    expected: '160/220',
  },
  {
    name: 'painted chips stacked at equal widths — what `grow` produces',
    html: `<div id="w"><a href="#" style="${PAINTED}width:200px">A</a>
           <a href="#" style="${PAINTED}width:200px">B</a></div>`,
    expected: null,
  },
  {
    name: 'BARE text links stacked and ragged — correct typography, not a defect',
    html: `<div id="w"><a href="#" style="${BARE}width:149px">CBK on WhatsApp</a>
           <a href="#" style="${BARE}width:110px">Contact us</a></div>`,
    expected: null,
  },
  {
    name: 'an UNPAINTED sibling sharing row two must not create a phantom lone item',
    html: `<div id="w" style="width:360px">
             <a href="#" style="${PAINTED}width:360px;float:left">Download PDF</a>
             <a href="#" style="${PAINTED}width:180px;float:left">Save image</a>
             <a href="#" style="${BARE}width:170px;float:left">Print</a>
           </div>`,
    expected: null,
  },
  {
    name: 'a 4px mismatch still counts — small enough to miss by eye, still a wobble',
    html: `<div id="w"><a href="#" style="${PAINTED}width:163px">A</a>
           <a href="#" style="${PAINTED}width:159px">B</a></div>`,
    expected: '163/159',
  },
  {
    name: 'a 2px mismatch does not — under the tolerance for rounding',
    html: `<div id="w"><a href="#" style="${PAINTED}width:200px">A</a>
           <a href="#" style="${PAINTED}width:202px">B</a></div>`,
    expected: null,
  },
];
