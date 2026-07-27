import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import bondsData from '../../public/data/bonds.json';
import ratesFeed from '../../public/data/rates.json';
import type { Bond } from '../../src/types/bond';

const BONDS = bondsData as unknown as Bond[];
const HERO = readFileSync(new URL('../../src/components/dashboard/TopYields.tsx', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../src/app/dashboard/page.tsx', import.meta.url), 'utf8');

/**
 * The first number anyone sees is the one most likely to be believed.
 *
 * The dashboard headline reads "What Kenya is paying savers TODAY" over the
 * best net yield at the stated price. For most bonds that price is par,
 * because this project publishes no market prices — a real figure, and not a
 * rate anybody can go and get.
 *
 * The gap is not academic. The tile that led this dashboard was a bond last
 * auctioned in FEBRUARY 2024, near the top of the rate cycle, while long paper
 * now clears around 13.6%. Nothing on the tile said so.
 */
describe('the dashboard hero dates its own claim', () => {
  it('is standing on bonds whose last auction may be years old', () => {
    // The premise of the whole test. If the shipped data ever becomes
    // uniformly fresh this can be relaxed — deliberately, not by drift.
    const withDates = BONDS.filter((b) => b.ytmAsOf);
    expect(withDates.length, 'no bond carries an ytmAsOf to display').toBeGreaterThan(10);
    const oldest = withDates.reduce((a, b) => (b.ytmAsOf! < a.ytmAsOf! ? b : a));
    const ageDays =
      (Date.now() - new Date(oldest.ytmAsOf!).getTime()) / 86_400_000;
    expect(
      ageDays,
      'every bond is recently auctioned — the staleness disclosure may no longer be needed'
    ).toBeGreaterThan(180);
  });

  it('shows each tile the date its own figure belongs to', () => {
    expect(HERO, 'the hero never renders ytmAsOf').toMatch(/ytmAsOf/);
    expect(HERO, 'the hero shows no "last auctioned" line').toMatch(/[Ll]ast auctioned/);
  });

  it('says par is a placeholder rather than letting it read as a market price', () => {
    expect(HERO).toMatch(/par — no market price published/);
  });

  /**
   * The comparison that makes the headline honest: what the market is paying
   * NOW, from the same feed this project publishes to other products.
   */
  it('sets the tiles against the most recent auction, not the flattering one', () => {
    expect(HERO, 'no current benchmark is shown').toMatch(/currentBenchmark/);
    // Newest by date, never highest by rate.
    expect(HERO).toMatch(/latestAuctionDate > a\.latestAuctionDate/);
    expect(HERO, 'the benchmark is not labelled as a rate rather than an offer').toMatch(
      /not offers/
    );

    const bands = (ratesFeed as { bondAuctionBenchmarks: { bands: {
      medianClearingRate: number | null; latestAuctionDate: string | null }[] } })
      .bondAuctionBenchmarks.bands;
    const quotable = bands.filter((b) => b.medianClearingRate !== null);
    expect(quotable.length, 'the feed has no quotable band to benchmark against').toBeGreaterThan(0);
  });

  /**
   * And the word that started it. "Today" over an undated figure is the exact
   * claim this project refuses everywhere else; if the headline keeps the word,
   * the tiles must carry their dates — which the assertions above enforce.
   */
  it('keeps the headline honest about the word it uses', () => {
    if (/savers today/i.test(PAGE)) {
      expect(
        HERO,
        'the headline says "today" while the tiles carry no date and no current benchmark'
      ).toMatch(/currentBenchmark/);
    }
  });
});
