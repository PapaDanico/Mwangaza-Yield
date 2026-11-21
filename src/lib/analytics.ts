/**
 * Which tools do people come back to?
 *
 * That is the only question this file answers, and it is the question the
 * business model turns on: the premium tier should be chosen by measured
 * retention, not by guessing. So this measures tool usage — and nothing else.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * No cookies, no device IDs, no fingerprinting, no IP handling, no session
 * stitching. The beacon carries an event name from the whitelist below and the
 * date. Two visits by the same person are indistinguishable from one visit by
 * two people — which loses "unique users" and keeps the promise the privacy
 * page makes. "Which tool is used most, and is it growing?" survives that
 * trade; it is the retention signal we actually need.
 *
 * Respects Do Not Track and Global Privacy Control: if either is set, every
 * call is a no-op. Localhost and non-production hosts are also no-ops so
 * development does not pollute the counts.
 */

/**
 * The complete vocabulary. The server rejects anything not on this list, so a
 * bug (or a prankster with curl) cannot invent unbounded blob keys.
 *
 * `view:*` are tool-page visits; `act:*` are the moments a tool actually did
 * its job for someone — the retention signal proper.
 */
export const TRACKED_EVENTS = [
  'view:landing',
  'view:dashboard',
  'view:goals',
  'view:tbills',
  'view:ladder',
  'view:calculator',
  'view:auctions',
  'view:portfolio',
  'view:prices',
  'view:sell',
  'view:alerts',
  'view:learn',
  'act:calculator-run',
  'act:sell-analysed',
  'act:bid-tested',
  'act:price-saved',
  'act:ladder-built',
  /* Following the WhatsApp channel. An `act:` rather than a `view:` because it
     is a reader choosing to keep hearing from us, which is the retention
     signal this list exists to capture — and the only measurement we will ever
     have of the channel, since WhatsApp tells admins nothing about who
     follows. It counts the click, not the follow: whether they completed it on
     WhatsApp's side is not ours to know. */
  'act:channel-followed',
] as const;

export type TrackedEvent = (typeof TRACKED_EVENTS)[number];

/** Route → view event. Routes not listed here are not measured at all. */
export const ROUTE_EVENTS: Record<string, TrackedEvent> = {
  '/': 'view:landing',
  '/dashboard': 'view:dashboard',
  '/goals': 'view:goals',
  '/tbills': 'view:tbills',
  '/ladder': 'view:ladder',
  '/calculator': 'view:calculator',
  '/auctions': 'view:auctions',
  '/portfolio': 'view:portfolio',
  '/prices': 'view:prices',
  '/sell': 'view:sell',
  '/alerts': 'view:alerts',
  '/learn': 'view:learn',
};

const ENDPOINT = '/.netlify/functions/track';

/** One count per event per page load: retention wants "used it", not keypresses. */
const sent = new Set<string>();

function optedOut(): boolean {
  if (typeof navigator === 'undefined') return true;
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (n.doNotTrack === '1' || n.globalPrivacyControl) return true;
  const host = window.location.hostname;
  return host !== 'mwangazayield.org' && host !== 'www.mwangazayield.org';
}

export function track(event: TrackedEvent): void {
  try {
    if (optedOut() || sent.has(event)) return;
    if (!(TRACKED_EVENTS as readonly string[]).includes(event)) return;
    sent.add(event);
    const body = JSON.stringify({ event });
    // sendBeacon survives navigation; fetch keepalive is the fallback.
    if (navigator.sendBeacon?.(ENDPOINT, body)) return;
    fetch(ENDPOINT, { method: 'POST', body, keepalive: true }).catch(() => undefined);
  } catch {
    // Analytics must never break a tool. Swallow everything.
  }
}

/**
 * "Used it" must mean someone did something. Every tool computes a default
 * result the moment it mounts (a calculator opens with a bond and an amount
 * already filled in), so an `act:` event fired from the result alone counts
 * page loads, not use — the figure a sponsor would be shown would be a
 * second copy of the view count. The gate holds an act event back until the
 * reader has changed a field (an `input` or `change` event anywhere on the
 * page), then sends it, and sends later ones straight away.
 *
 * Pure so it can be tested without a browser: `send` is whatever delivers.
 */
export function createUseGate(send: (event: TrackedEvent) => void) {
  const pending = new Set<TrackedEvent>();
  let interacted = false;
  return {
    request(event: TrackedEvent) {
      if (interacted) send(event);
      else pending.add(event);
    },
    noteInteraction() {
      if (interacted) return;
      interacted = true;
      for (const e of pending) send(e);
      pending.clear();
    },
    get interacted() {
      return interacted;
    },
  };
}

let gate: ReturnType<typeof createUseGate> | null = null;
let detachGate: (() => void) | null = null;
/** The path the gate was opened on; a different path means a new page. */
let gatePath = '';

/**
 * Forget the touch when the route changes. Next.js navigates without a page
 * load, so a module-level gate survived it: touching the calculator and then
 * following a link to /sell/ counted the sell page's default analysis as a
 * use. Each tool page now needs its own touch.
 */
export function resetUseGate(): void {
  detachGate?.();
  detachGate = null;
  gate = null;
}

/** Report that a tool did its job for a reader who has touched the page. */
export function trackOnUse(event: TrackedEvent): void {
  try {
    if (typeof document === 'undefined' || optedOut()) return;
    // Belt and braces with trackRoute's reset: whichever effect runs first on
    // a client-side navigation, a gate opened on another path is not reused.
    if (gate && gatePath !== window.location.pathname) resetUseGate();
    if (!gate) {
      gatePath = window.location.pathname;
      gate = createUseGate(track);
      const detach = () => {
        document.removeEventListener('input', onTouch, true);
        document.removeEventListener('change', onTouch, true);
      };
      const onTouch = () => {
        gate?.noteInteraction();
        detach();
      };
      document.addEventListener('input', onTouch, true);
      document.addEventListener('change', onTouch, true);
      detachGate = detach;
    }
    gate.request(event);
  } catch {
    // Analytics must never break a tool.
  }
}

/** For route changes: a new page load starts a fresh dedupe window per view. */
export function trackRoute(pathname: string): void {
  resetUseGate();
  const event = ROUTE_EVENTS[pathname.replace(/\/+$/, '') || '/'];
  if (event) track(event);
}
