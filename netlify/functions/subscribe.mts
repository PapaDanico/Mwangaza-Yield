/**
 * Store or remove a push subscription. The only endpoint this app has ever had.
 *
 * WHAT IT ACCEPTS, AND WHAT IT REFUSES TO
 * ----------------------------------------
 * A push endpoint, its two keys, and the market-wide rules the reader wants
 * evaluated. Nothing else. `validSubscription` is a whitelist, so a client that
 * sends holdings — a future one, a modified one, a mistaken one — has the extra
 * fields dropped on the floor rather than written to storage. See push-rules.ts
 * for why the boundary sits exactly there.
 *
 * There is no account, no e-mail and no identifier we choose. The blob key is a
 * SHA-256 of the endpoint the push service issued, which means we can find a
 * subscription to update or delete it, and cannot enumerate anything else.
 */
import type { Config, Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import { createHash } from 'node:crypto';
import { validSubscription, type StoredSubscription } from '../../src/lib/push-rules';

const CORS = {
  // The app is the only caller, and it is served from these origins.
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ALLOWED = [
  'https://mwangazayield.org',
  'https://www.mwangazayield.org',
  'https://main--mwangazayield.netlify.app',
];

function cors(origin: string | null) {
  // Deploy previews are allowed so the flow can be tested before it ships, but
  // by exact pattern rather than by "ends with netlify.app", which would let any
  // Netlify site on the internet post here.
  const ok =
    origin &&
    (ALLOWED.includes(origin) || /^https:\/\/deploy-preview-\d+--mwangazayield\.netlify\.app$/.test(origin));
  return { ...CORS, 'Access-Control-Allow-Origin': ok ? origin : ALLOWED[0] };
}

const keyFor = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex');

export default async (req: Request, _context: Context) => {
  const headers = { ...cors(req.headers.get('origin')), 'Content-Type': 'application/json' };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  // Method before body. Parsing first made a GET — which has no body to parse —
  // answer "expected JSON", telling a caller their payload was wrong when the
  // real problem was the verb.
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'expected JSON' }), { status: 400, headers });
  }

  const store = getStore('push-subscriptions');

  if (req.method === 'DELETE') {
    const endpoint = (body as { endpoint?: unknown })?.endpoint;
    if (typeof endpoint !== 'string') {
      return new Response(JSON.stringify({ error: 'endpoint required' }), { status: 400, headers });
    }
    // Unsubscribing must always look like it worked. Reporting "you were not
    // subscribed" would answer a question about someone else's endpoint.
    await store.delete(keyFor(endpoint)).catch(() => {});
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  if (!validSubscription(body)) {
    return new Response(JSON.stringify({ error: 'invalid subscription' }), { status: 400, headers });
  }

  const record: StoredSubscription = {
    endpoint: body.endpoint,
    keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    rules: body.rules,
    createdAt: new Date().toISOString(),
  };

  await store.setJSON(keyFor(body.endpoint), record);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};

export const config: Config = { path: '/api/subscribe' };
