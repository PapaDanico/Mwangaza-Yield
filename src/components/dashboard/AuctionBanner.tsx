'use client';

import Link from 'next/link';
import { Radar, ArrowRight } from 'lucide-react';
import { useBondStore } from '@/stores/bondStore';
import { daysUntil, formatCompactKES, effectiveAuctionStatus } from '@/lib/utils';
import Reserve from '@/components/shared/Reserve';

export default function AuctionBanner() {
  const auctions = useBondStore((s) => s.auctions);
  const next = auctions
    .map((a) => ({ ...a, status: effectiveAuctionStatus(a) }))
    .filter((a) => a.status === 'open' || a.status === 'upcoming')
    .sort((a, b) => a.offerCloseDate.localeCompare(b.offerCloseDate))[0];

  /* 144 on a phone, 119 from sm — MEASURED on the built page, not guessed.
   *
   * Reserve's contract is "roughly what the real card occupies, so the swap
   * does not shift either way", and 92 stopped satisfying it. The first
   * UPCOMING auction with a multi-issue code — "2699/091 · 2673/182 ·
   * 2628/364", three Treasury bill issues sold together — wraps to a second
   * line, and the code is deliberately never clamped (see the note below on
   * what clamping it cost). The banner rendered at 144px against a 92px
   * reservation, and /dashboard/ CLS went 0.0512 -> 0.105, past the 0.1 budget.
   *
   * The same min-heights are on the rendered Link, so a SHORT code cannot
   * shift the other way either. Both states now occupy one height at each
   * breakpoint, which is the only arrangement that shifts in neither
   * direction. */
  const SLOT = 'min-h-[144px] sm:min-h-[119px]';
  if (!next) return <Reserve height={92} className={SLOT} />;
  const days = daysUntil(next.offerCloseDate);

  return (
    <Link
      href="/auctions/"
      className={`card flex items-center gap-4 border-l-4 border-l-gold-500 transition hover:border-gold-500 ${SLOT}`}
    >
      <div className="rounded-xl bg-ink p-3 text-gold-500">
        <Radar size={26} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-700">
          {next.status === 'open' ? 'Auction open now' : 'Next auction'}
        </p>
        {/* Wraps rather than truncates. "TBA — August 202…" cut the year off
            the one fact the banner exists to deliver, and a countdown to an
            amputated date is worse than a second line. Two lines is the cap:
            beyond that it would push the macro strip off the fold again.

            THE CAP WAS RIGHT. CLAMPING BOTH FIELDS TOGETHER WAS NOT.

            issueCode and bondName were one clamped paragraph, so the two-line
            budget was spent in reading order and the identifier was first in
            the queue to be cut. A switch auction's code is long — "FXD1/2012/015
            + bills → FXD4/2019/010" — and at 390px the card rendered

                FXD1/2012/015 + bills →…

            an arrow pointing at nothing. What a switch auction IS is the bond
            you switch into, and that was the exact substring the clamp ate. Six
            of eight lines were hidden; the fix was never "more lines".

            The two fields are not equally important and no longer share a
            budget. The code identifies the auction and is never clamped. The
            name describes it, largely restating the code — here "Switch auction
            into 10-Year Fixed Coupon Bond FXD4/2019/010 (Ksh 15B)", whose bond
            is already in the code above and whose amount is already on the line
            below — so it takes the single clamped line and yields first.

            An ordinary auction is unaffected: a short code is one line, the name
            is one line, two lines as before. Only a switch auction takes a third
            line, which is the case that was previously unreadable.

            The name is dropped entirely below sm:. Measured at 390px, showing
            the full code costs 22px of banner height and showing the name costs
            another 19px, and the macro strip below was ALREADY 22px past the
            fold before any of this. On the screen where vertical space is
            scarcest, the field that is mostly restatement is the one that goes:
            its bond code is in the line above it and its amount is in the line
            below it, so on a phone it was earning its 19px twice over. */}
        <p className="font-display font-semibold leading-snug text-ink [overflow-wrap:anywhere]">
          {next.issueCode}
        </p>
        <p className="hidden font-display text-sm font-medium leading-snug text-ink-muted sm:[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:1] overflow-hidden">
          {next.bondName}
        </p>
        <p className="text-sm text-ink-muted">
          {(next.amountOfferedKES ?? 0) > 0 ? `${formatCompactKES(next.amountOfferedKES)} on offer · ` : ''}
          closes {next.offerCloseDate}
        </p>
      </div>
      <div className="text-right">
        <p className="num text-2xl font-bold text-gold-700">{Math.max(days, 0)}</p>
        <p className="text-xs text-ink-faint">days left</p>
      </div>
      <ArrowRight size={18} className="text-ink-faint" />
    </Link>
  );
}
