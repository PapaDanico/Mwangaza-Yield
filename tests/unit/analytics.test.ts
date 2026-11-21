import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { TRACKED_EVENTS, ROUTE_EVENTS } from '../../src/lib/analytics';

/**
 * The privacy page promises the counter stores "a name next to a number".
 * These tests keep that promise structural: a fixed vocabulary on both ends,
 * pinned to each other, and every measured route actually shipped.
 */

describe('the event vocabulary', () => {
  it('is mirrored exactly by the server-side whitelist', () => {
    // The function deliberately duplicates the list rather than importing app
    // code; this test is what keeps the copies from drifting.
    const fn = readFileSync('netlify/functions/track.mts', 'utf8');
    const serverList = Array.from(fn.matchAll(/'((?:view|act):[a-z-]+)'/g), (m) => m[1]);
    expect(new Set(serverList)).toEqual(new Set(TRACKED_EVENTS));
    expect(serverList).toHaveLength(TRACKED_EVENTS.length); // no duplicates either
  });

  it('names only tools and actions — nothing that could identify a person', () => {
    for (const e of TRACKED_EVENTS) {
      expect(e).toMatch(/^(view|act):[a-z-]+$/);
    }
  });

  it('maps only routes that actually exist in the app', () => {
    for (const route of Object.keys(ROUTE_EVENTS)) {
      const dir = route === '/' ? 'src/app/page.tsx' : `src/app${route}/page.tsx`;
      expect(() => readFileSync(dir, 'utf8'), `${route} has no page`).not.toThrow();
    }
  });

  it('every route event is in the vocabulary', () => {
    for (const event of Object.values(ROUTE_EVENTS)) {
      expect(TRACKED_EVENTS).toContain(event);
    }
  });
});

describe('the server refuses to become a logger', () => {
  const fn = readFileSync('netlify/functions/track.mts', 'utf8');

  it('never touches an IP, user agent, or referrer', () => {
    expect(fn).not.toMatch(/x-forwarded-for|user-agent|referer|referrer|context\.ip/i);
  });

  it('rejects events off the whitelist instead of storing them', () => {
    expect(fn).toMatch(/!TRACKED_EVENTS\.has\(event\)/);
  });

  it('keeps reads behind a token that must be configured', () => {
    expect(fn).toMatch(/METRICS_TOKEN/);
    expect(fn).toMatch(/!configured \|\| given !== configured/);
  });
});

describe('"used it" means someone touched the tool', () => {
  it('holds an act event until a field changes, then sends it once', async () => {
    const { createUseGate } = await import('../../src/lib/analytics');
    const sent: string[] = [];
    const gate = createUseGate((e) => sent.push(e));
    gate.request('act:calculator-run'); // the default result on mount
    expect(sent).toEqual([]);
    gate.noteInteraction();
    expect(sent).toEqual(['act:calculator-run']);
    gate.noteInteraction(); // a second touch changes nothing
    gate.request('act:ladder-built'); // after a touch, straight through
    expect(sent).toEqual(['act:calculator-run', 'act:ladder-built']);
  });

  it('a page that is only looked at sends no act event', async () => {
    const { createUseGate } = await import('../../src/lib/analytics');
    const sent: string[] = [];
    const gate = createUseGate((e) => sent.push(e));
    gate.request('act:sell-analysed');
    gate.request('act:sell-analysed');
    expect(sent).toEqual([]);
    expect(gate.interacted).toBe(false);
  });

  it('the three tools that compute on mount all go through the gate', () => {
    for (const f of [
      'src/app/calculator/CalculatorClient.tsx',
      'src/app/sell/SellClient.tsx',
      'src/app/ladder/page.tsx',
    ]) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toMatch(/trackOnUse\('act:/);
      expect(src, f).not.toMatch(/\btrack\('act:(calculator-run|sell-analysed|ladder-built)'\)/);
    }
  });
});

describe('a touch on one page does not count use on the next', () => {
  it('trackRoute resets the gate, so client-side navigation needs a new touch', () => {
    const src = readFileSync('src/lib/analytics.ts', 'utf8');
    const body = src.slice(src.indexOf('export function trackRoute'));
    expect(body.slice(0, body.indexOf('\n}'))).toMatch(/resetUseGate\(\)/);
    expect(src).toMatch(/export function resetUseGate[\s\S]*?detachGate\?\.\(\)[\s\S]*?gate = null/);
    // and a gate opened on another path is never reused, whatever runs first
    expect(src).toMatch(/gatePath !== window\.location\.pathname\) resetUseGate\(\)/);
  });
});
