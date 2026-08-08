import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readPersisted, writePersisted } from '../../src/lib/persisted';

/**
 * Settings that survive closing the app.
 *
 * The hook's timing is proved in the browser suite, because hydration order is
 * exactly the kind of thing a mocked React render agrees with and a real one
 * does not. What is worth pinning here is the behaviour under a hostile
 * storage: private mode, a full quota, or a value left behind by an older
 * build. Every one of those must degrade to a working page with a default,
 * because this state is a convenience and the page is the product.
 */

const store: Record<string, string> = {};

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('a value written is a value read', () => {
  it('round-trips numbers, strings and arrays', () => {
    writePersisted('n', 6_500_000);
    writePersisted('s', 'hello');
    writePersisted('a', ['KE1', 'KE2']);
    expect(readPersisted('n', 0)).toBe(6_500_000);
    expect(readPersisted('s', '')).toBe('hello');
    expect(readPersisted('a', [] as string[])).toEqual(['KE1', 'KE2']);
  });

  it('namespaces its keys so it cannot collide with anything else on the origin', () => {
    writePersisted('ladder:amount', 1);
    expect(Object.keys(store)).toEqual(['mwangaza:ladder:amount']);
  });

  it('distinguishes a stored zero or empty array from nothing stored', () => {
    // The bug this prevents: treating a falsy stored value as absent and
    // handing back the default, so a reader can never set a rung count of 0
    // or clear their selection.
    writePersisted('zero', 0);
    writePersisted('empty', []);
    expect(readPersisted('zero', 99)).toBe(0);
    expect(readPersisted('empty', ['x'])).toEqual([]);
  });
});

describe('a hostile storage never breaks the page', () => {
  it('returns the default when nothing has been stored', () => {
    expect(readPersisted('never-written', 42)).toBe(42);
  });

  it('returns the default rather than throwing on a corrupt value', () => {
    store['mwangaza:broken'] = '{not json';
    expect(readPersisted('broken', 7)).toBe(7);
  });

  it('returns the default when storage itself throws (private mode)', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => { throw new Error('SecurityError'); },
        setItem: () => { throw new Error('SecurityError'); },
      },
    });
    expect(readPersisted('anything', 'fallback')).toBe('fallback');
    // And a write that cannot happen is not an error the reader should see.
    expect(() => writePersisted('anything', 'x')).not.toThrow();
  });

  it('swallows a quota failure — the session works, it just forgets', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: () => { throw new Error('QuotaExceededError'); },
      },
    });
    expect(() => writePersisted('big', 'x'.repeat(1000))).not.toThrow();
  });

  it('is inert with no window at all, which is how the pages prerender', () => {
    vi.stubGlobal('window', undefined);
    expect(readPersisted('k', 'server-default')).toBe('server-default');
    expect(() => writePersisted('k', 'v')).not.toThrow();
  });
});

describe('a stored value of the wrong shape', () => {
  /* `JSON.parse(raw) as T` is a CAST, NOT A VALIDATION, and the try/catch only
   * ever sees text that is not JSON. A value of the wrong TYPE parses
   * perfectly and sails past it wearing the T the cast promised.
   *
   * The docstring on that catch used to claim it handled "a value written by
   * an older build" — the one case it could not see, because a build that
   * changes a shape writes perfectly good JSON. */

  it('does not hand an object to code expecting an array', () => {
    store['mwangaza:ladder:chosen'] = JSON.stringify({ a: 1 });
    // The ladder calls .length on this. An object has none, and the page the
    // reader came back to would throw on an upgrade they never noticed.
    expect(readPersisted<string[]>('ladder:chosen', [])).toEqual([]);
  });

  it('does not hand an array to code expecting an object', () => {
    store['mwangaza:opts'] = JSON.stringify([1, 2, 3]);
    expect(readPersisted('opts', { mode: 'auto' })).toEqual({ mode: 'auto' });
  });

  /* "3000000" + 1 is "30000001". A ladder built off string concatenation
   * instead of arithmetic is worse than one that forgot the amount. */
  it('does not hand a string to code expecting a number', () => {
    store['mwangaza:ladder:amount'] = JSON.stringify('3000000');
    expect(readPersisted('ladder:amount', 3_000_000)).toBe(3_000_000);
  });

  it('does not hand a scalar to code expecting a structure, or the reverse', () => {
    store['mwangaza:ladder:chosen'] = JSON.stringify(5);
    expect(readPersisted<string[]>('ladder:chosen', [])).toEqual([]);
    store['mwangaza:ladder:rungs'] = JSON.stringify({});
    expect(readPersisted('ladder:rungs', 4)).toBe(4);
  });

  /* Infinity does not survive JSON.stringify, but 1e400 is valid JSON and
   * parses to Infinity — finite-looking to every `> 0` guard downstream. */
  it('refuses a number that is not finite', () => {
    store['mwangaza:ladder:amount'] = '1e400';
    expect(readPersisted('ladder:amount', 3_000_000)).toBe(3_000_000);
  });

  it('refuses a stored null where a value is expected', () => {
    store['mwangaza:ladder:chosen'] = JSON.stringify(null);
    expect(readPersisted<string[]>('ladder:chosen', [])).toEqual([]);
  });

  /* The premise: a value of the RIGHT shape still comes back, or every
   * assertion above passes for the wrong reason. */
  it('still returns what the reader actually saved', () => {
    store['mwangaza:ladder:chosen'] = JSON.stringify(['KE1', 'KE2']);
    expect(readPersisted<string[]>('ladder:chosen', [])).toEqual(['KE1', 'KE2']);
    store['mwangaza:ladder:amount'] = JSON.stringify(5_000_000);
    expect(readPersisted('ladder:amount', 3_000_000)).toBe(5_000_000);
  });
});
