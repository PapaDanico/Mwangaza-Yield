/**
 * The browser-facing half of alerts: permission, and putting an event on the
 * screen. Kept apart from `alerts.ts` so the rule engine stays pure and
 * testable without a DOM.
 *
 * Android will not display `new Notification(...)` from a page at all — it
 * throws — so delivery goes through the service worker registration wherever
 * one exists, and only falls back to the constructor on desktop.
 */
import type { AlertEvent } from './alerts';

export type NotifyState = 'unsupported' | 'default' | 'granted' | 'denied';

/** How many system notifications one visit may raise before it collapses the
 *  rest into a single summary. Nine coupons landing at once is information;
 *  nine separate banners is an app you turn off. */
const MAX_BANNERS = 3;

export function notifyState(): NotifyState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotifyState;
}

export async function requestNotifyPermission(): Promise<NotifyState> {
  if (notifyState() === 'unsupported') return 'unsupported';
  try {
    return (await Notification.requestPermission()) as NotifyState;
  } catch {
    return notifyState();
  }
}

async function show(title: string, body: string, tag: string, href: string): Promise<boolean> {
  const options: NotificationOptions = {
    body,
    tag,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { href },
  };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, options);
        return true;
      }
    }
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Raise system notifications for events that have not been shown before.
 * Returns how many banners were raised — 0 is a normal, silent outcome when
 * permission was never granted, and the in-app list still shows everything.
 */
export async function notifyEvents(events: AlertEvent[]): Promise<number> {
  if (!events.length || notifyState() !== 'granted') return 0;

  const banners = events.slice(0, MAX_BANNERS);
  let shown = 0;
  for (const e of banners) {
    if (await show(e.title, e.body, e.id, e.href)) shown += 1;
  }
  const rest = events.length - banners.length;
  if (rest > 0) {
    const ok = await show(
      `${rest} more alert${rest === 1 ? '' : 's'}`,
      'Open Mwangaza Yield to see the rest.',
      'mwangaza-alert-overflow',
      '/alerts/'
    );
    if (ok) shown += 1;
  }
  return shown;
}
