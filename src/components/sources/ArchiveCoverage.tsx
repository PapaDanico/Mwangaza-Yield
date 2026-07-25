import archiveData from '../../../public/data/auction-results.json';
import { assessArchive } from '@/lib/archive-quality';
import type { AuctionPrint } from '@/types/bond';

/**
 * What the auction archive contains, and — more usefully — what it does not.
 *
 * Computed at build time from the shipped file, so it cannot drift out of step
 * with the data or quietly become a boast. Every number here moves on its own
 * the next time the parser improves or a gap is filled.
 *
 * Publishing the gaps is deliberate. This archive is the only machine-readable
 * record of Kenyan bond auction results that we know of; the figures exist in
 * CBK's PDFs and nowhere else in a form anyone can compute with. The weak move
 * would be to describe it by its headline count. The strong one is to say
 * exactly how much of it is complete, because a reader who can see the holes
 * can rely on the rest — and because anyone evaluating this for serious use
 * will find the holes in ten minutes anyway. Better they read them here.
 */
const quality = assessArchive(archiveData as unknown as AuctionPrint[]);

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sand-200">
      <div
        className={pct >= 80 ? 'h-full bg-mint-600' : pct >= 50 ? 'h-full bg-gold-500' : 'h-full bg-slate-400'}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function ArchiveCoverage() {
  const { records, issueCodes, complete, completePct, bidToCover, earliest, latest, fields, stale } =
    quality;
  const newest = quality.parserVersions[quality.parserVersions.length - 1];

  return (
    <section className="not-prose my-8 rounded-2xl border border-sand-300 bg-sand-50 p-5">
      <h3 className="font-display text-lg font-bold text-ink">
        The auction archive, measured
      </h3>
      <p className="mt-1 text-sm text-ink-muted">
        {records.toLocaleString()} auction results across {issueCodes} issue codes
        {earliest && latest ? `, ${earliest.slice(0, 4)} to ${latest.slice(0, 4)}` : ''}, parsed from
        CBK&apos;s published PDFs. Those PDFs are public; this is the only machine-readable form of
        them we know of. Here is how much of it is actually filled in.
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { k: 'Records', v: records.toLocaleString() },
          { k: 'Complete on all six fields', v: `${complete} (${completePct}%)` },
          { k: 'Usable for bid-to-cover', v: bidToCover.toLocaleString() },
          { k: 'Issue codes', v: issueCodes.toLocaleString() },
        ].map(({ k, v }) => (
          <div key={k} className="rounded-xl bg-sand-100 p-3">
            <dt className="text-xs text-ink-muted">{k}</dt>
            <dd className="num mt-0.5 text-lg font-bold text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      {stale > 0 && (
        // Shown only mid-rebuild, and it says which way the error runs. When the
        // parser is fixed, the fix reaches a row only when that row is next
        // fetched, so for a while the archive holds two readings of the same
        // documents. Every figure above is then a floor: the rows still on the
        // older parser can gain fields on re-read and cannot lose them. Leaving
        // that unsaid would let a reader take a percentage measured mid-rebuild
        // as the parser's ceiling, and judge the dataset on it.
        <p className="mt-4 rounded-xl border border-gold-300 bg-gold-50 p-3 text-xs text-ink-soft">
          <span className="font-semibold text-ink">Re-read in progress.</span>{' '}
          <span className="num">{stale.toLocaleString()}</span> of{' '}
          <span className="num">{records.toLocaleString()}</span> rows were produced by an earlier
          version of the parser and are being re-read at version{' '}
          <span className="num">{newest}</span> as each source PDF is next fetched. The percentages
          here are therefore a floor: a re-read can fill a field, never empty one.
        </p>
      )}

      <ul className="mt-4 space-y-2.5">
        {fields.map((f) => (
          <li key={f.field}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-ink-soft">{f.label}</span>
              <span className="num shrink-0 text-ink-muted">
                {f.present}/{f.total} · {f.pct}%
              </span>
            </div>
            <div className="mt-1">
              <Bar pct={f.pct} />
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-ink-muted">
        A field counts as present only if it carries a figure. Zero is read as
        &ldquo;unparsed&rdquo;, not as data — no Kenyan auction offers, accepts or prices at zero,
        so a nought in these columns is a line the parser could not read rather than a fact about
        the market. Every percentage below 100 is a job still to do, and the number is here so that
        finishing it is visible.
      </p>
    </section>
  );
}
