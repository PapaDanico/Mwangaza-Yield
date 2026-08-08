/**
 * State that survives closing the app.
 *
 * The ladder let a reader hand-pick every rung — swap this bond for that one,
 * add a sixth, drop the one they already hold — and then threw the whole thing
 * away on reload. On a phone that is not a rare event: an installed PWA is
 * routinely evicted and re-launched when it goes to the background, so the
 * work could vanish without the reader ever knowingly leaving the page.
 *
 * WHY LOCAL STORAGE AND NOT THE DEXIE STORES
 * ------------------------------------------
 * The Dexie stores hold the reader's DATA — recorded prices, holdings, saved
 * plans — which is theirs, sometimes large, and worth structuring. This is a
 * handful of UI settings. Local storage is synchronous, needs no migration,
 * and cannot half-open. Nothing here ever leaves the device either way.
 *
 * WHY THE FIRST RENDER IGNORES IT
 * -------------------------------
 * The app is a static export: the server produced the HTML at build time, when
 * no reader's storage existed. Reading local storage during render would make
 * the first client render disagree with that HTML and trip a hydration error —
 * which React resolves by throwing the whole tree away. So the default renders
 * first and the stored value arrives in an effect, one frame later. That is
 * also why writes are skipped until the read has happened: an eager write on
 * mount would overwrite a real saved value with the default.
 */

import { useEffect, useRef, useState } from 'react';

const PREFIX = 'mwangaza:';

/**
 * Is a stored value the same SHAPE as the default it would replace?
 *
 * `JSON.parse(raw) as T` is a CAST, NOT A VALIDATION, and the `catch` below
 * only ever sees text that is not JSON. A value of the wrong TYPE parses
 * perfectly and sails straight past it wearing the `T` the cast promised.
 *
 * That is not hypothetical here, and it is the case the old comment on the
 * catch got wrong: it claimed to handle "a value written by an older build",
 * but a build that CHANGES A SHAPE writes valid JSON. `ladder:chosen` moving
 * from `string[]` to an object would leave every returning reader's browser
 * handing an object to code that calls `.length` on it — a crash on the page
 * they came back to, caused by an upgrade they did not know happened.
 *
 * Shape, not deep schema. The point is to catch the difference between an
 * array, an object and a scalar, which is what makes callers throw; validating
 * every field would be a second source of truth for four UI settings.
 */
function usableAsDefault<T>(stored: unknown, fallback: T): stored is T {
  if (stored === null || stored === undefined) return false;
  const fallbackIsStructured = typeof fallback === 'object' && fallback !== null;
  const storedIsStructured = typeof stored === 'object';
  if (storedIsStructured !== fallbackIsStructured) return false;
  if (fallbackIsStructured && Array.isArray(fallback) !== Array.isArray(stored)) return false;
  // A scalar must still be the same KIND of scalar: `ladder:amount` reaching
  // the yield maths as "3000000" rather than 3000000 produces string
  // concatenation, not arithmetic, and a ladder built off a silently wrong
  // number is worse than one that forgot the reader's amount.
  if (!storedIsStructured && typeof stored !== typeof fallback) return false;
  // Infinity and NaN do not survive JSON, but a hand-edited 1e400 parses to
  // Infinity, which is finite-looking to every `> 0` guard downstream.
  if (typeof stored === 'number' && !Number.isFinite(stored)) return false;
  return true;
}

export function readPersisted<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    // The shape check, not the cast — see usableAsDefault. The catch below
    // cannot see this class of value, because it is perfectly good JSON.
    return usableAsDefault(parsed, fallback) ? parsed : fallback;
  } catch {
    // Private mode, a full quota, or text that is not JSON at all. A usable
    // default beats a crash on a page the reader came here to use.
    return fallback;
  }
}

export function writePersisted(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* Storage unavailable or full — the session still works, it just forgets. */
  }
}

/**
 * `useState`, but the value comes back next time.
 *
 * Same signature as `useState` so a page adopts it by changing one word.
 */
export function usePersistedState<T>(
  key: string,
  initial: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const hydrated = useRef(false);

  useEffect(() => {
    setValue(readPersisted(key, initial));
    hydrated.current = true;
    // Runs once per key. `initial` is deliberately not a dependency: a caller
    // passing an inline object literal would otherwise re-read on every render
    // and stamp the reader's stored value back to the default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!hydrated.current) return;
    writePersisted(key, value);
  }, [key, value]);

  return [value, setValue];
}
