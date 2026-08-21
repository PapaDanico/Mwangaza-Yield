import type { Metadata } from 'next';
import MetricsClient from './MetricsClient';

/**
 * The owner's view of the usage counters.
 *
 * WHY THIS PAGE EXISTS
 * --------------------
 * `netlify/functions/track.mts` has been counting tool usage into Netlify
 * Blobs and serving the last 60 days behind METRICS_TOKEN, and nothing has
 * ever rendered it. The data was being collected and never read, which is the
 * worst of both worlds: the privacy cost of collecting was being paid and the
 * benefit was not being taken.
 *
 * WHY IT IS NOT IN THE SITEMAP OR THE NAV
 * ---------------------------------------
 * It is for the site owner, not for readers. It carries no data of its own —
 * everything is fetched client-side with a token the owner pastes in — so the
 * page itself is not sensitive, but indexing it would advertise an endpoint
 * and put a token prompt under the site's brand in search results. Registered
 * in tests/unit/sitemap.test.ts under DELIBERATELY_EXCLUDED, and marked
 * noindex here, because a crawler does not read that test.
 *
 * It is also deliberately absent from src/lib/routes.ts, which drives the nav,
 * the mobile bar and the command palette. A reader should not find this.
 */
export const metadata: Metadata = {
  title: 'Usage — Mwangaza Yield',
  description: 'Owner view of tool usage counters.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return <MetricsClient />;
}
