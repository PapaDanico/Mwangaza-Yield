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

export function readPersisted<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Private mode, a full quota, or a value written by an older build. A
    // usable default beats a crash on a page the reader came here to use.
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
