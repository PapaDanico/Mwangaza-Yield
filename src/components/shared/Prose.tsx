/** Shared shell for the written pages (about, legal, FAQ, support). */
export default function Prose({
  title,
  lead,
  updated,
  children,
}: {
  title: string;
  lead?: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight text-ink">{title}</h1>
      {lead && <p className="mt-2 text-lg text-ink-muted">{lead}</p>}
      {updated && <p className="mt-1 text-xs text-ink-faint">Last updated {updated}</p>}
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-ink-soft [&_a]:text-gold-700 [&_a]:underline-offset-2 hover:[&_a]:underline [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink [&_ul]:space-y-1.5">
        {children}
      </div>
    </div>
  );
}
