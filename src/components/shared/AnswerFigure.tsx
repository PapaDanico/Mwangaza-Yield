/**
 * The answer, first.
 *
 * A calculator exists to answer one question, and the answer used to be the
 * first of eight identically-sized rows — the same type size as "interest owed
 * to the seller". Here it is the one dark, raised surface on the page and the
 * largest figure on it, with the working laid out beneath.
 *
 * It renders what it is given and computes nothing: the figure arrives
 * formatted from lib/. The label text is unchanged from the row it replaced.
 */
export default function AnswerFigure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="relative mb-5 overflow-hidden rounded-2xl bg-treasury-navy p-5 text-sand-100 shadow-ticket ring-1 ring-inset ring-white/10 md:p-6">
      <p className="text-sm font-medium text-gold-300">{label}</p>
      <p className="num mt-2 text-5xl font-semibold leading-none tracking-tight text-gold-400 md:text-6xl">
        {value}
      </p>
      {hint && <p className="mt-3 max-w-[42ch] text-xs leading-relaxed text-sand-300">{hint}</p>}
    </div>
  );
}
