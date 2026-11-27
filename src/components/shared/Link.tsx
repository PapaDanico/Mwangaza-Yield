'use client';

/**
 * next/link, prefetching on intent instead of on sight.
 *
 * WHY. Next prefetches every <Link> the moment it scrolls into view. On the
 * landing page that is about eleven routes, so a reader who opens one page and
 * reads it downloads roughly 300-360 KB of compressed code for pages they never
 * visit (measured on the live site, 27 Nov 2026: 164 KB at load on `/`, then
 * +339 KB within six seconds of idle). This audience is mostly on metered
 * mobile data, where that is a real cost, and it doubles a first visit.
 *
 * WHAT. Viewport prefetch is off. The route is prefetched when the reader
 * shows intent: the pointer enters the link, a finger touches it, or keyboard
 * focus lands on it. That arrives 100-300 ms before the click, which is most
 * of what prefetch was buying, without paying for routes nobody opens.
 *
 * In the App Router, `prefetch={false}` disables hover prefetch too, which is
 * why the intent handlers call `router.prefetch` themselves rather than leaving
 * it to Link. A caller can still pass `prefetch` explicitly to opt back in.
 */
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { forwardRef, useCallback, useRef, type ComponentProps } from 'react';

type Props = ComponentProps<typeof NextLink>;

const Link = forwardRef<HTMLAnchorElement, Props>(function Link(
  { prefetch, onMouseEnter, onTouchStart, onFocus, href, ...rest },
  ref
) {
  const router = useRouter();
  const done = useRef(false);

  const warm = useCallback(() => {
    if (done.current) return;
    const target = typeof href === 'string' ? href : href.pathname;
    // Only internal routes; next/link already treats anything else as a plain anchor.
    if (!target || !target.startsWith('/')) return;
    done.current = true;
    try {
      router.prefetch(target);
    } catch {
      // Prefetch is an optimisation; a failure must never break the link.
    }
  }, [href, router]);

  return (
    <NextLink
      ref={ref}
      href={href}
      prefetch={prefetch ?? false}
      onMouseEnter={(e) => {
        warm();
        onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
      onFocus={(e) => {
        warm();
        onFocus?.(e);
      }}
      {...rest}
    />
  );
});

export default Link;
