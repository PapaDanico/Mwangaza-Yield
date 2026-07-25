import Link from 'next/link';
import { GLOSSARY_BY_SLUG } from '@/lib/glossary';

/**
 * Marks a technical term and sends the reader somewhere it is explained.
 *
 * Deliberately a link rather than a hover tooltip: most of our readers are on
 * a phone, where there is no hover, and popovers get clipped by scrolling
 * cards. A dotted underline that opens a real explanation works on every
 * device, works offline, and can be read at length rather than glimpsed.
 *
 * The `title` attribute carries the plain definition too, so a desktop user
 * gets the short answer without leaving the page.
 */
export default function Term({
  slug,
  children,
}: {
  slug: string;
  children?: React.ReactNode;
}) {
  const entry = GLOSSARY_BY_SLUG[slug];
  if (!entry) return <>{children}</>;

  return (
    <Link
      href={`/glossary/#${slug}`}
      title={entry.plain}
      className="underline decoration-sand-400 decoration-dotted underline-offset-[3px] transition-colors hover:decoration-gold-600"
    >
      {children ?? entry.term}
    </Link>
  );
}
