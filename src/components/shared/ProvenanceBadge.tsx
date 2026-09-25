import { ShieldCheck, Search } from 'lucide-react';
import { provenanceOf } from '@/lib/figure-route';

/** Icon-only below sm:, where a third of a phone row cannot fit the words. */
export default function ProvenanceBadge({ via }: { via?: string | null }) {
  const p = provenanceOf(via);
  if (!p) return null;
  const Icon = p.tone === 'primary' ? ShieldCheck : Search;
  return (
    <span
      title={p.detail}
      aria-label={`${p.label}: ${p.detail}`}
      className={`ml-1 inline-flex items-center gap-0.5 align-middle ${p.tone === 'primary' ? 'text-emerald-800' : 'text-gold-800'}`}
    >
      <Icon size={11} aria-hidden />
      <span className="hidden sm:inline" aria-hidden>{p.label}</span>
    </span>
  );
}
