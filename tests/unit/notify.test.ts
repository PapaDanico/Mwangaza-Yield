/**
 * `notify.ts` is the one lib module that only runs in a browser, which is why
 * it went uncovered: `Notification` and `navigator.serviceWorker` do not exist
 * under vitest's node environment. They are cheap to stand up by hand, and the
 * two things worth pinning here are both invisible to a human clicking around:
 *
 *   - the banner cap, which only misbehaves on a visit with 4+ alerts, and
 *   - the service-worker preference, whose absence breaks Android *only*.
 *
 * A desktop tester would never see either fail.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { AlertEvent } from '../../src/lib/alerts';
import { notifyState, requestNotifyPermission, notifyEvents } from '../../src/lib/notify';

type Raised = { via: 'sw' | 'constructor'; title: string; tag: string; href: unknown };

let raised: Raised[] = [];

/** Stand up just enough browser for notify.ts. `registration: null` is a real
 *  state — a desktop page before the service worker has activated. */
function browser(opts: {
  permission?: NotificationPermission;
  serviceWorker?: boolean;
  registration?: boolean;
  showThrows?: boolean;
  requestPermission?: () => Promise<NotificationPermission>;
}) {
  const {
    permission = 'granted',
    serviceWorker = true,
    registration = true,
    showThrows = false,
  } = opts;

  const record = (via: 'sw' | 'constructor', title: string, o: NotificationOptions) => {
    if (showThrows) throw new Error('notification blocked');
    raised.push({ via, title, tag: o.tag ?? '', href: (o.data as { href?: string })?.href });
  };

  class FakeNotification {
    static permission = permission;
    static requestPermission =
      opts.requestPermission ?? (async () => permission);
    constructor(title: string, o: NotificationOptions = {}) {
      record('constructor', title, o);
    }
  }

  const g = globalThis as Record<string, unknown>;
  g.Notification = FakeNotification;
  g.window = { Notification: FakeNotification };
  g.navigator = serviceWorker
    ? {
        serviceWorker: {
          getRegistration: async () =>
            registration
              ? {
                  showNotification: async (title: string, o: NotificationOptions) =>
                    record('sw', title, o),
                }
              : undefined,
        },
      }
    : {};
}

const event = (n: number): AlertEvent =>
  ({
    id: `e${n}`,
    title: `Alert ${n}`,
    body: `Body ${n}`,
    href: `/alerts/#e${n}`,
  }) as AlertEvent;

const events = (n: number) => Array.from({ length: n }, (_, i) => event(i + 1));

beforeEach(() => {
  raised = [];
});

afterEach(() => {
  const g = globalThis as Record<string, unknown>;
  delete g.Notification;
  delete g.window;
  delete g.navigator;
});

describe('notifyState', () => {
  it('reports unsupported when there is no window at all', () => {
    expect(notifyState()).toBe('unsupported');
  });

  it('reports unsupported in a window without the Notification API', () => {
    (globalThis as Record<string, unknown>).window = {};
    expect(notifyState()).toBe('unsupported');
  });

  it('reads the live permission rather than caching it', () => {
    browser({ permission: 'default' });
    expect(notifyState()).toBe('default');
    (globalThis as { Notification: { permission: string } }).Notification.permission = 'denied';
    expect(notifyState()).toBe('denied');
  });
});

describe('requestNotifyPermission', () => {
  it('does not call the browser at all when unsupported', async () => {
    await expect(requestNotifyPermission()).resolves.toBe('unsupported');
  });

  it('returns what the user chose', async () => {
    browser({ permission: 'default', requestPermission: async () => 'granted' });
    await expect(requestNotifyPermission()).resolves.toBe('granted');
  });

  it('falls back to the current state when the request throws', async () => {
    // Safari rejects requestPermission() outside a user gesture. The caller
    // renders from the return value, so a throw must not escape as a rejection.
    browser({
      permission: 'denied',
      requestPermission: async () => {
        throw new Error('gesture required');
      },
    });
    await expect(requestNotifyPermission()).resolves.toBe('denied');
  });
});

describe('notifyEvents', () => {
  it('stays silent, and raises nothing, without permission', async () => {
    browser({ permission: 'default' });
    await expect(notifyEvents(events(5))).resolves.toBe(0);
    expect(raised).toHaveLength(0);
  });

  it('stays silent on an empty list', async () => {
    browser({});
    await expect(notifyEvents([])).resolves.toBe(0);
    expect(raised).toHaveLength(0);
  });

  it('raises one banner per event while under the cap', async () => {
    browser({});
    await expect(notifyEvents(events(3))).resolves.toBe(3);
    expect(raised.map((r) => r.title)).toEqual(['Alert 1', 'Alert 2', 'Alert 3']);
  });

  it('collapses the tail into a single summary once over the cap', async () => {
    // The comment's own justification: nine coupons at once is information,
    // nine banners is an app you turn off.
    browser({});
    await expect(notifyEvents(events(9))).resolves.toBe(4);
    expect(raised).toHaveLength(4);
    expect(raised.slice(0, 3).map((r) => r.title)).toEqual(['Alert 1', 'Alert 2', 'Alert 3']);
    expect(raised[3].title).toBe('6 more alerts');
    expect(raised[3].href).toBe('/alerts/');
  });

  it('says "1 more alert", not "1 more alerts", at the boundary', async () => {
    browser({});
    await expect(notifyEvents(events(4))).resolves.toBe(4);
    expect(raised[3].title).toBe('1 more alert');
  });

  it('tags each banner with its event id so a repeat replaces rather than stacks', async () => {
    browser({});
    await notifyEvents(events(2));
    expect(raised.map((r) => r.tag)).toEqual(['e1', 'e2']);
  });

  it('delivers through the service worker when one is registered', async () => {
    // Android throws on `new Notification(...)` from a page. If this ever
    // reads 'constructor', notifications are silently dead on Android while
    // every desktop browser still looks fine.
    browser({});
    await notifyEvents(events(2));
    expect(raised.every((r) => r.via === 'sw')).toBe(true);
  });

  it('falls back to the constructor when no registration exists yet', async () => {
    browser({ registration: false });
    await expect(notifyEvents(events(1))).resolves.toBe(1);
    expect(raised[0].via).toBe('constructor');
  });

  it('falls back to the constructor in a browser without service workers', async () => {
    browser({ serviceWorker: false });
    await expect(notifyEvents(events(1))).resolves.toBe(1);
    expect(raised[0].via).toBe('constructor');
  });

  it('counts what was actually shown, not what was attempted', async () => {
    browser({ showThrows: true });
    await expect(notifyEvents(events(9))).resolves.toBe(0);
  });
});
