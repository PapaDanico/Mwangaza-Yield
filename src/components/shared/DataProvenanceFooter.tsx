import { latestFigureDate } from '@/lib/data-freshness';

/**
 * The provenance line under every page.
 *
 * WHY THIS NO LONGER SAYS "LAST SYNC"
 *
 * It printed `meta.generatedAt` as "Last sync: 2026-08-19 15:49" — on every
 * route, to every reader — while the figures on those same pages were from
 * 24 September. `generatedAt` means "the pipeline ran", not "the figures were
 * updated", and the two diverge whenever figures are entered from a CBK
 * document by hand, which is how this archive has been kept current since
 * the pipeline stopped. So the footer told readers their data was five weeks
 * stale when it was current to the day.
 *
 * That is the exact defect `readerNotice` was rewritten to remove from the
 * banner in August, surviving one component over. It was found by running
 * the built site and reading it, not by any test: every test that touched
 * freshness looked at the banner, and none looked at the footer.
 *
 * It now states the date of the newest reader-facing figure, which is a fact
 * about the data. Pipeline liveness has not been hidden — it is the Data
 * Health panel's "Pipeline last ran" row, read by whoever operates this.
 */
export default function DataProvenanceFooter() {
  const latest = latestFigureDate();
  return (
    <div className="mx-auto mt-8 max-w-6xl px-4 text-[12px] text-ink">
      Bonds: CBK | Auctions: CBK | Macro: KNBS/CBK/World Bank/IMF
      {latest ? ` | Latest figure: ${latest}` : ''}
    </div>
  );
}
