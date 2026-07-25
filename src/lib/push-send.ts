/**
 * What the sender decides, separated from how it talks to storage and to the
 * push services.
 *
 * The Netlify function around this is glue: list blobs, call `dueFor`, post the
 * results, write back `nextLog`. Everything that could be wrong in an
 * interesting way — sending twice, sending nine banners at once, letting the
 * delivery log grow without bound — is here, where a test can reach it without
 * a network or a scheduler.
 */
import { evaluateAlerts, type AlertEvent } from './alerts';
import { serverRules, type PublicRule } from './push-rules';
import type { AuctionSchedule, TBill } from '@/types/bond';

/** Delivered ids kept per subscriber: comfortably more than a year of auctions,
 *  small enough that the record stays one cheap blob. */
export const LOG_LIMIT = 60;

/** Banners per subscriber per run. A morning that produces more than this is a
 *  data error, not a busy market, and the reader should not pay for it. */
export const MAX_PER_RUN = 3;

export interface SenderWorld {
  auctions: AuctionSchedule[];
  tbills: TBill[];
}

/**
 * Events this subscriber is owed and has not already been sent.
 *
 * `bonds` and `holdings` are empty and always will be: the only rules that
 * survive the wire are the ones that do not need them. Passing them empty is
 * not a stub — it is the guarantee, expressed in code.
 */
export function dueFor(
  rules: PublicRule[],
  alreadySent: string[],
  world: SenderWorld,
  now: Date,
  cap: number = MAX_PER_RUN
): AlertEvent[] {
  const already = new Set(alreadySent);
  const events = evaluateAlerts(
    serverRules(rules ?? []),
    { auctions: world.auctions, tbills: world.tbills, bonds: [], holdings: [] },
    now
  );
  return events.filter((e) => !already.has(e.id)).slice(0, cap);
}

/**
 * The delivery log after a successful send. Bounded, and de-duplicated so an
 * id cannot occupy two slots and push a still-relevant one off the end.
 */
export function nextLog(alreadySent: string[], sent: AlertEvent[], limit = LOG_LIMIT): string[] {
  const seen = new Set(alreadySent);
  const merged = [...alreadySent];
  for (const e of sent) {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      merged.push(e.id);
    }
  }
  return merged.slice(-limit);
}

/** Push services report a subscription the browser has thrown away with these.
 *  Anything else is a transient failure and the endpoint must be kept. */
export function isDeadEndpoint(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}
