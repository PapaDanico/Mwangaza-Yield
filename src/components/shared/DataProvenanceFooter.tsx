import meta from '../../../public/data/meta.json';

export default function DataProvenanceFooter() {
  return (
    <div className="mx-auto mt-8 max-w-6xl px-4 text-[12px] text-ink">
      Bonds: CBK | Auctions: CBK | Macro: KNBS/CBK/World Bank | Last sync: {meta.generatedAt.slice(0, 16).replace('T', ' ')}
    </div>
  );
}
