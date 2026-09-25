/**
 * How a hand-maintained figure arrived, in the reader's words. The `via`
 * field has been recorded on every such row since August (see "Hand-edit a
 * generated file only with the route recorded" in CLAUDE.md) but was never
 * shown, so an owner-supplied CBK notice and a search fallback looked alike.
 * An unknown or absent route shows nothing rather than a guess.
 */
export interface Provenance {
  label: string;
  detail: string;
  tone: 'primary' | 'secondary';
}

const ROUTES: Record<string, Provenance> = {
  'supplied-document': {
    label: 'Official notice',
    detail: 'Transcribed from the publisher’s own document and cross-checked against figures already held.',
    tone: 'primary',
  },
  'search-corroborated': {
    label: 'Corroborated',
    detail: 'Not read from the primary document: agreed across independent reports and reconciled arithmetically. Replaced when the document is in hand.',
    tone: 'secondary',
  },
  'imf-weo': {
    label: 'IMF',
    detail: 'IMF World Economic Outlook series, corroborated against independent reports of the same vintage.',
    tone: 'primary',
  },
  'cbk-home': {
    label: 'CBK site',
    detail: 'Read from the Central Bank of Kenya’s published figures.',
    tone: 'primary',
  },
};

export function provenanceOf(via: string | undefined | null): Provenance | null {
  return via ? ROUTES[via] ?? null : null;
}
