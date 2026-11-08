/** Shared shell for the written pages (about, legal, FAQ, support). */
export default function Prose({
  title,
  lead,
  updated,
  level = 1,
  children,
}: {
  title: string;
  lead?: string;
  updated?: string;
  /** 1 for the page's own title; 2 for a further section on a page that already
   *  has one. A page has exactly one h1 — /yield-curve/ and /feed/ rendered two,
   *  because their second block used this shell and got a second h1 with it. */
  level?: 1 | 2;
  children: React.ReactNode;
}) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <div className="mx-auto max-w-2xl">
      <Heading className="text-3xl font-bold tracking-tight text-ink">{title}</Heading>
      {lead && <p className="mt-2 text-lg text-ink-muted">{lead}</p>}
      {updated && <p className="mt-1 text-xs text-ink-faint">Last updated {updated}</p>}
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-ink-soft [&_a]:text-gold-700 [&_a]:underline-offset-2 hover:[&_a]:underline [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink [&_ul]:space-y-1.5">
        {children}
      </div>
    </div>
  );
}
