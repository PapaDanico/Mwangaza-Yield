/**
 * The boundary between what a server may know and what stays on the device.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * A sender that can tell you "your FXD1/2016/10 coupon lands on Monday" is a
 * sender that knows what you own and how much of it. That is the single most
 * sensitive thing this app holds, and shipping it to a server to enable a
 * convenience would quietly retire the promise the whole product is built on.
 *
 * So the split is not a preference, it is the design:
 *
 *   PUBLIC   — facts about the market that are true for everyone. A bid window
 *              closing; a T-Bill clearing above some rate. Knowing you asked to
 *              be told reveals an interest, not a position.
 *
 *   PRIVATE  — facts about your money. Coupons and maturities are computed from
 *              your holdings and never leave the device, so they are raised
 *              when you open the app and by nothing else.
 *
 * A reader who subscribes to push therefore gets the market half remotely and
 * the personal half locally, and the server learns nothing it could sell,
 * subpoena or lose.
 *
 * WHY A WHITELIST
 * ---------------
 * `publicRules` names the fields it copies rather than deleting the ones it
 * fears. A blacklist is one new rule kind away from leaking: add a rule that
 * carries an amount and a blacklist ships it to the server by default, silently
 * and correctly, until someone notices. A whitelist fails the other way — the
 * new field simply does not travel until a human adds it here.
 */
import type { AlertRule, AlertRuleKind } from './alerts';

/** Rule kinds a server can evaluate without knowing anything about the reader. */
export const SERVER_DELIVERABLE = ['auction-window', 'tbill-threshold'] as const;

/** Rule kinds that require holdings, and so can only ever run on the device. */
export const DEVICE_ONLY = ['coupon-due', 'maturity'] as const;

export type ServerRuleKind = (typeof SERVER_DELIVERABLE)[number];

/** The only shape that is ever transmitted. No ids, no timestamps, no amounts. */
export interface PublicRule {
  kind: ServerRuleKind;
  leadDays: number;
  tenorDays?: 91 | 182 | 364;
  thresholdPct?: number;
}

export interface StoredSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  rules: PublicRule[];
  createdAt: string;
  /** Bumped every time the sender delivers, so dead endpoints are visible. */
  lastSentAt?: string;
}

export function isServerDeliverable(kind: AlertRuleKind): kind is ServerRuleKind {
  return (SERVER_DELIVERABLE as readonly string[]).includes(kind);
}

/**
 * Reduce a device's rule set to the part a server may hold. Disabled rules are
 * dropped outright — a server should not be told what you decided against.
 */
export function publicRules(rules: AlertRule[]): PublicRule[] {
  const out: PublicRule[] = [];
  for (const r of rules) {
    if (!r.enabled || !isServerDeliverable(r.kind)) continue;
    if (r.kind === 'auction-window') {
      out.push({ kind: 'auction-window', leadDays: r.leadDays });
    } else if (r.tenorDays && r.thresholdPct != null) {
      out.push({
        kind: 'tbill-threshold',
        leadDays: 0,
        tenorDays: r.tenorDays,
        thresholdPct: r.thresholdPct,
      });
    }
  }
  return out;
}

/**
 * Rebuild rules the engine can run, on the server, from the transmitted shape.
 * Ids are synthesised from the rule's own content: the server has no device
 * identity to borrow, and content-derived ids keep event ids stable across
 * sends so a re-run on the same day does not notify twice.
 */
export function serverRules(rules: PublicRule[]): AlertRule[] {
  return rules.map((r) => ({
    id:
      r.kind === 'auction-window'
        ? `srv-auction-${r.leadDays}`
        : `srv-tbill-${r.tenorDays}-${r.thresholdPct}`,
    kind: r.kind,
    enabled: true,
    leadDays: r.leadDays,
    tenorDays: r.tenorDays,
    thresholdPct: r.thresholdPct,
    createdAt: '',
  }));
}

/** True when the payload is a well-formed subscription we are willing to store. */
export function validSubscription(body: unknown): body is {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  rules: PublicRule[];
} {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  if (typeof b.endpoint !== 'string' || !/^https:\/\//.test(b.endpoint)) return false;
  // A push endpoint is a bearer credential in URL form. An unbounded one is a
  // storage-exhaustion vector on a free tier, and nothing legitimate is long.
  if (b.endpoint.length > 1024) return false;
  const keys = b.keys as Record<string, unknown> | undefined;
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return false;
  if (!Array.isArray(b.rules) || b.rules.length > 8) return false;
  return b.rules.every((r) => {
    if (!r || typeof r !== 'object') return false;
    if (!isServerDeliverable(r.kind)) return false;
    if (typeof r.leadDays !== 'number' || r.leadDays < 0 || r.leadDays > 90) return false;
    if (r.kind === 'tbill-threshold') {
      if (![91, 182, 364].includes(r.tenorDays)) return false;
      if (typeof r.thresholdPct !== 'number' || r.thresholdPct < 0 || r.thresholdPct > 100) {
        return false;
      }
    }
    return true;
  });
}
