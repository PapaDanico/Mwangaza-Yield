import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The failure path of subscribing, which had a defect nothing caught.
 *
 * `subscribePush` used to unsubscribe on any failed registration, whether or
 * not it had created the subscription. A reader already subscribed who pressed
 * the button again handed over their EXISTING subscription; one failed POST
 * then destroyed it, while the sender still held the endpoint. It would push
 * the next morning, take a 410, prune, and the reader's alerts would stop with
 * no explanation beyond "try again shortly".
 *
 * Testing this needs the browser surface stubbed, which is why it had no
 * coverage. It is worth the fixture: this is the only place in the app that
 * can silently revoke something a reader asked for.
 */
const KEY = 'BAga6srdkWOWgJ5NDJ-HMH0ldk7IsVyUClqtaJOItxXXdj1W-uGN6hMzAWfamQkTZijqxg07L6_HlMk1zltiIdc';

interface Harness {
  unsubscribed: boolean;
  created: boolean;
}

/** Load push.ts against a stubbed browser. `existing` decides whether the
 *  service worker already has a subscription; `postOk` whether the sender
 *  accepts it. */
async function load(existing: boolean, postOk: boolean) {
  const h: Harness = { unsubscribed: false, created: false };

  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    toJSON: () => ({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'p', auth: 'a' },
    }),
    unsubscribe: async () => {
      h.unsubscribed = true;
      return true;
    },
  };

  const registration = {
    pushManager: {
      getSubscription: async () => (existing ? subscription : null),
      subscribe: async () => {
        h.created = true;
        return subscription;
      },
    },
  };

  const Notify = { permission: 'granted', requestPermission: async () => 'granted' };
  // `pushSupported()` reads these OFF the window object, not off globalThis —
  // stubbing them only as globals leaves 'PushManager' in window false and the
  // whole feature reports itself unsupported.
  vi.stubGlobal('window', { PushManager: function PushManager() {}, Notification: Notify });
  vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve(registration) } });
  vi.stubGlobal('Notification', Notify);
  vi.stubGlobal('atob', (s: string) => Buffer.from(s, 'base64').toString('binary'));
  vi.stubGlobal('fetch', async () => ({ ok: postOk }));
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', KEY);

  vi.resetModules();
  const mod = await import('../../src/lib/push');
  return { mod, h };
}

describe('subscribePush', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('registers a new subscription when the sender accepts it', async () => {
    const { mod, h } = await load(false, true);
    expect(await mod.subscribePush([])).toBe('on');
    expect(h.created).toBe(true);
    expect(h.unsubscribed).toBe(false);
  });

  it('undoes a subscription IT created when the sender rejects it', async () => {
    // Leaving this one would tell the reader the switch is off while the
    // browser quietly holds a subscription no sender knows about.
    const { mod, h } = await load(false, false);
    expect(await mod.subscribePush([])).toBe('failed');
    expect(h.created).toBe(true);
    expect(h.unsubscribed).toBe(true);
  });

  it('LEAVES a pre-existing subscription alone when the sender rejects it', async () => {
    // The defect. Destroying this loses delivery the sender may still be
    // honouring, and the reader is told only "try again shortly".
    const { mod, h } = await load(true, false);
    expect(await mod.subscribePush([])).toBe('failed');
    expect(h.created).toBe(false);
    expect(h.unsubscribed).toBe(false);
  });

  it('reuses a pre-existing subscription rather than minting a second', async () => {
    const { mod, h } = await load(true, true);
    expect(await mod.subscribePush([])).toBe('on');
    expect(h.created).toBe(false);
    expect(h.unsubscribed).toBe(false);
  });

  it('stays invisible when no VAPID key reached the build', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', '');
    const Notify = { permission: 'default', requestPermission: async () => 'default' };
    vi.stubGlobal('window', { PushManager: function PushManager() {}, Notification: Notify });
    vi.stubGlobal('navigator', { serviceWorker: {} });
    vi.stubGlobal('Notification', Notify);
    vi.resetModules();
    const mod = await import('../../src/lib/push');
    expect(mod.pushConfigured()).toBe(false);
    expect(await mod.subscribePush([])).toBe('unconfigured');
  });
});
