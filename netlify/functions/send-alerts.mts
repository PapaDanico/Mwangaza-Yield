/**
 * The sender. Runs once a day, evaluates the market-wide rules each subscriber
 * asked for, and pushes anything they have not already been told.
 *
 * It runs the SAME `evaluateAlerts` the browser runs. That is why that function
 * was written to take its clock as an argument: there is one definition of
 * "this auction closes in three days", and it lives in src/lib/alerts.ts, not
 * once there and once here where the two can drift apart.
 *
 * WHAT IT KNOWS
 * -------------
 * Nothing about anyone. It reads the same public JSON the site serves, and the
 * only per-subscriber state is a push endpoint, its keys, the market rules the
 * reader chose, and the ids of events already delivered. Holdings are absent
 * because they were never sent — see src/lib/push-rules.ts.
 *
 * This file is deliberately thin. Every decision worth testing — what is due,
 * what the log becomes, whether a failure means the endpoint is dead — lives in
 * src/lib/push-send.ts, where a test can reach it without a scheduler.
 */
import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { dueFor, isDeadEndpoint, nextLog } from '../../src/lib/push-send';
import type { AlertEvent } from '../../src/lib/alerts';
import type { StoredSubscription } from '../../src/lib/push-rules';
import type { AuctionSchedule, TBill } from '../../src/types/bond';

interface Record extends StoredSubscription {
  sent?: string[];
}

async function loadJSON<T>(base: string, path: string): Promise<T[]> {
  try {
    const res = await fetch(`${base}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T[];
  } catch (e) {
    console.error(`could not load ${path}:`, e);
    return [];
  }
}

export default async () => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, URL: SITE } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    // Loud, because a silent no-op here looks exactly like "nobody had alerts".
    console.error('VAPID keys absent — refusing to run rather than appear to work');
    return new Response('missing VAPID configuration', { status: 500 });
  }
  webpush.setVapidDetails(
    VAPID_SUBJECT || 'mailto:info@mwangazadigital.org',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );

  const base = SITE || 'https://mwangazayield.org';
  const [auctions, tbills] = await Promise.all([
    loadJSON<AuctionSchedule>(base, '/data/auctions.json'),
    loadJSON<TBill>(base, '/data/tbills.json'),
  ]);
  if (!auctions.length && !tbills.length) {
    // Both files empty means the fetch failed, not that Kenya stopped issuing
    // debt. Sending on an empty world would tell nobody anything; failing
    // loudly puts it in the function log where it can be noticed.
    console.error('no source data reachable — sending nothing');
    return new Response('no data', { status: 503 });
  }

  const store = getStore('push-subscriptions');
  const { blobs } = await store.list();
  const now = new Date();
  let delivered = 0;
  let pruned = 0;
  let failures = 0;

  for (const { key } of blobs) {
    const rec = (await store.get(key, { type: 'json' })) as Record | null;
    if (!rec?.endpoint) continue;

    const due = dueFor(rec.rules, rec.sent ?? [], { auctions, tbills }, now);
    if (!due.length) continue;

    const sent: AlertEvent[] = [];
    // Per record, not per run: `pruned` is a counter for the summary line, and
    // reading it as "this record is gone" would delete-guard every subscriber
    // processed after the first dead endpoint.
    let dead = false;
    for (const e of due) {
      try {
        await webpush.sendNotification(
          { endpoint: rec.endpoint, keys: rec.keys },
          JSON.stringify({ title: e.title, body: e.body, href: e.href, tag: e.id })
        );
        sent.push(e);
        delivered += 1;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (isDeadEndpoint(status)) {
          // The browser threw this subscription away — cleared data, or the app
          // was uninstalled. Keeping it means retrying a corpse every morning.
          await store.delete(key).catch(() => {});
          pruned += 1;
          dead = true;
          break;
        }
        // Transient. Stop sending to this subscriber but keep them, and record
        // what did get through so it is not repeated tomorrow.
        console.error(`send failed (${status ?? 'unknown'}):`, err);
        failures += 1;
        break;
      }
    }
    // The record no longer exists, or nothing got through — either way there is
    // nothing to write back. Logging an event that failed to send would lose it
    // permanently, since tomorrow's run would treat it as already delivered.
    if (dead || !sent.length) continue;

    await store.setJSON(key, {
      ...rec,
      lastSentAt: now.toISOString(),
      sent: nextLog(rec.sent ?? [], sent),
    });
  }

  const summary = `subscribers=${blobs.length} delivered=${delivered} pruned=${pruned} failures=${failures}`;
  console.log(summary);
  return new Response(summary, { status: 200 });
};

// 04:00 UTC is 07:00 in Nairobi — before the working day, and after the data
// refresh that runs at 03:00 UTC on weekdays.
export const config: Config = { schedule: '0 4 * * *' };
