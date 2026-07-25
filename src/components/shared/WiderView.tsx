/**
 * A handoff from Mwangaza Yield to the sister tool that covers the rest of a
 * household's money.
 *
 * The mirror of JiPange's "Going deeper" card, and it exists because the
 * traffic was flowing one way. JiPange sends the few readers who need real
 * bond analytics here; nothing here sent anyone back, even though the question
 * this app most often leaves unanswered is the one JiPange is built for.
 *
 * That question is specific. A goal plan ends in "you need KES X a month" —
 * and this app has no view whatsoever on where X comes from. Whether that
 * contribution is affordable depends on a budget, a debt schedule and an
 * emergency fund, none of which are government bonds and none of which belong
 * in a government-bond tool. Answering "invest 60,000 a month" to someone
 * still paying off a loan at 24% is not depth, it is a blind spot.
 *
 * Stated as a sister tool, not a recommendation. Both products earn their
 * trust by selling nothing, and a handoff written like an advert would spend
 * precisely the credibility that makes either worth using. No affiliate
 * parameters, no campaign tags — a link.
 */
import { ArrowUpRight } from 'lucide-react';

export interface WiderLink {
  /** The question this app cannot answer. */
  question: string;
  /** What the sister tool does about it. */
  answer: string;
  href: string;
  label: string;
}

export default function WiderView({ wider }: { wider: WiderLink }) {
  return (
    <div className="no-print rounded-2xl border border-gold-300/60 bg-gold-50/40 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">
        The wider picture
      </p>
      <p className="mt-2 text-sm font-medium text-ink">{wider.question}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{wider.answer}</p>
      <a
        href={wider.href}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-sand-50 px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-sand-200"
      >
        {wider.label}
        <ArrowUpRight size={15} />
      </a>
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">
        JiPange is our sister tool — free, no account, and it sells nothing either.
      </p>
    </div>
  );
}
