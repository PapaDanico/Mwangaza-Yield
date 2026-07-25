/**
 * The client half of push. Subscribes the browser, tells the sender which
 * market-wide rules to evaluate, and keeps that in step when the rules change.
 *
 * The public key is read from the build environment. When it is absent — a
 * local `npm run dev`, a CI build, a fork — `pushConfigured()` is false and the
 * whole feature stays invisible rather than offering a button that cannot work.
 */
import type { AlertRule } from './alerts';
import { publicRules } from './push-rules';

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
const ENDPOINT = '/api/subscribe';

export type PushState = 'unsupported' | 'unconfigured' | 'off' | 'on';

export function pushConfigured(): boolean {
  return VAPID_PUBLIC_KEY.length > 20;
}

function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** VAPID keys travel as base64url; `applicationServerKey` wants raw bytes. */
function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  // The buffer, not the view: a Uint8Array's `buffer` is typed ArrayBufferLike,
  // which could be a SharedArrayBuffer, and `applicationServerKey` will not take
  // one. Allocating the ArrayBuffer first keeps the type exact.
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i += 1) view[i] = raw.charCodeAt(i);
  return buf;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (!pushConfigured()) return 'unconfigured';
  try {
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

async function post(method: 'POST' | 'DELETE', body: unknown): Promise<boolean> {
  try {
    const res = await fetch(ENDPOINT, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Ask for permission, subscribe, and register the market rules with the sender.
 *
 * On any failure the browser-side subscription is torn down again. A browser
 * that thinks it is subscribed while the sender has never heard of it produces
 * the worst outcome available: a reader who was promised alerts, sees the
 * switch on, and never hears anything.
 */
export async function subscribePush(rules: AlertRule[]): Promise<PushState | 'denied' | 'failed'> {
  if (!pushSupported()) return 'unsupported';
  if (!pushConfigured()) return 'unconfigured';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  try {
    const reg = await navigator.serviceWorker.ready;

    // Whether THIS call created the subscription decides what may be torn down
    // if the registration fails. An earlier version unsubscribed either way,
    // which quietly broke delivery for the readers most engaged with the
    // feature: someone already subscribed who pressed the button again — after
    // changing a rule, or because a transient error had shown the switch as
    // off — handed us their existing subscription, and one failed POST
    // destroyed it. The sender still held that endpoint, pushed to it the next
    // morning, took the 410 and pruned it. Alerts simply stopped, and the only
    // thing the reader was told was "try again shortly".
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      }));

    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
    if (!json.endpoint || !json.keys) throw new Error('subscription missing keys');

    const ok = await post('POST', {
      endpoint: json.endpoint,
      keys: json.keys,
      rules: publicRules(rules),
    });
    if (!ok) {
      // Undo only what this call built. A pre-existing subscription is left
      // alone: the sender may well still have it on file, so leaving it is
      // recoverable and destroying it is not.
      if (!existing) await sub.unsubscribe().catch(() => {});
      return 'failed';
    }
    return 'on';
  } catch {
    return 'failed';
  }
}

export async function unsubscribePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      // Tell the sender first: if the browser drops the subscription and the
      // network call then fails, we have lost the endpoint needed to delete it
      // and would push to it every morning until it 410s.
      await post('DELETE', { endpoint: sub.endpoint });
      await sub.unsubscribe().catch(() => {});
    }
    return 'off';
  } catch {
    return 'off';
  }
}

/**
 * Re-register rules after the reader changes them. Silently does nothing when
 * they are not subscribed — changing a rule is not a reason to ask again.
 */
export async function syncPushRules(rules: AlertRule[]): Promise<void> {
  if (!pushSupported() || !pushConfigured()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
    if (!json.endpoint || !json.keys) return;
    await post('POST', { endpoint: json.endpoint, keys: json.keys, rules: publicRules(rules) });
  } catch {
    /* the rules still work on this device; the sender is simply out of step */
  }
}
