'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Target, Calculator, Radar, Briefcase,
  Layers, Tag, ArrowRight, Search, BookOpen, TrendingUp,
  Receipt, FileText, Zap, Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBondStore } from '@/stores/bondStore';
import { cmdKey } from '@/lib/shortcuts';
import { COMMAND_PALETTE_ROUTES } from '@/lib/routes';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  category: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

function normalize(s: string) { return s.toLowerCase().replace(/\s+/g, ' ').trim(); }

function fuzzyMatch(query: string, target: string): boolean {
  const q = normalize(query);
  const t = normalize(target);
  if (t.includes(q)) return true;
  // subsequence match
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const bonds = useBondStore((s) => s.bonds);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const navigate = useCallback(
    (href: string) => { router.push(href); onClose(); },
    [router, onClose],
  );

  const navIcons = {
    dashboard: <LayoutDashboard size={15} />,
    calculator: <Calculator size={15} />,
    portfolio: <Briefcase size={15} />,
    auctions: <Radar size={15} />,
    goals: <Target size={15} />,
    ladder: <Layers size={15} />,
    prices: <Tag size={15} />,
    learn: <BookOpen size={15} />,
    'yield-curve': <TrendingUp size={15} />,
    tbills: <Receipt size={15} />,
    macro: <Globe size={15} />,
  } as const;

  const navItems: CommandItem[] = COMMAND_PALETTE_ROUTES.map((route) => ({
    id: route.id,
    label: `Go to ${route.label}`,
    shortcut: route.shortcutKeys?.join(' '),
    category: 'Navigation',
    icon: navIcons[route.id as keyof typeof navIcons] ?? <ArrowRight size={15} />,
    action: () => navigate(route.href),
  }));

  const actionItems: CommandItem[] = [
    { id: 'receipt-history', label: 'View Receipt History', description: 'All calculation receipts', category: 'Actions', icon: <FileText size={15} />, action: () => navigate('/receipts/') },
    { id: 'pwa-debug', label: 'PWA Diagnostics', description: 'Service worker & cache status', category: 'Actions', icon: <Zap size={15} />, action: () => navigate('/_debug/pwa/') },
    { id: 'shortcuts', label: 'Show Keyboard Shortcuts', description: 'Press ? anytime', category: 'Actions', icon: <Receipt size={15} />, action: () => { onClose(); document.dispatchEvent(new CustomEvent('mwangaza:help')); } },
  ];

  const bondItems: CommandItem[] = bonds
    .filter((b) => !query || fuzzyMatch(query, `${b.issueCode} ${b.name}`))
    .slice(0, 6)
    .map((b) => ({
      id: `bond-${b.isin}`,
      label: b.issueCode,
      description: `${b.couponRate.toFixed(3)}% · matures ${b.maturityDate}${b.taxExempt ? ' · tax-free' : ''}`,
      category: 'Bonds',
      icon: <ArrowRight size={15} />,
      action: () => {
        const params = new URLSearchParams({ isin: b.isin });
        navigate(`/calculator/?${params}`);
      },
    }));

  const allItems: CommandItem[] = query
    ? [
        ...navItems.filter((i) => fuzzyMatch(query, i.label)),
        ...actionItems.filter((i) => fuzzyMatch(query, `${i.label} ${i.description ?? ''}`)),
        ...bondItems,
      ]
    : [...navItems, ...actionItems];

  const grouped: Record<string, CommandItem[]> = {};
  for (const item of allItems) {
    (grouped[item.category] ??= []).push(item);
  }

  const flatItems = allItems;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, flatItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        flatItems[selected]?.action();
      }
    },
    [flatItems, selected, onClose],
  );

  // Reset selection when query changes.
  useEffect(() => setSelected(0), [query]);

  // Scroll selected item into view.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  let globalIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-treasury-navy/40 pt-[10vh] backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-sand-300 bg-sand-50 shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-sand-300 px-4 py-3">
          <Search size={16} className="shrink-0 text-ink-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search bonds…"
            className="min-w-0 flex-1 bg-transparent font-sans text-sm text-ink outline-none placeholder:text-ink-faint"
            aria-label="Command palette search"
            role="combobox"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="palette-results"
          />
          <kbd className="hidden shrink-0 rounded-md border border-sand-300 px-1.5 py-0.5 font-mono text-[10px] text-ink-faint sm:block">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <ul
          ref={listRef}
          id="palette-results"
          role="listbox"
          className="max-h-80 overflow-y-auto py-1"
          aria-label="Command results"
        >
          {Object.entries(grouped).map(([category, items]) => (
            <li key={category} role="presentation">
              <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-faint">
                {category}
              </p>
              <ul role="group" aria-label={category}>
                {items.map((item) => {
                  const idx = globalIdx++;
                  const isSelected = idx === selected;
                  return (
                    <li
                      key={item.id}
                      data-idx={idx}
                      role="option"
                      aria-selected={isSelected}
                      onClick={item.action}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm',
                        isSelected
                          ? 'bg-gold-50 text-gold-700'
                          : 'text-ink hover:bg-sand-100',
                      )}
                    >
                      <span className={cn('shrink-0', isSelected ? 'text-gold-600' : 'text-ink-muted')}>
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{item.label}</span>
                        {item.description && (
                          <span className="block truncate text-[11px] text-ink-faint">{item.description}</span>
                        )}
                      </span>
                      {item.shortcut && (
                        <span className="ml-auto flex shrink-0 gap-1">
                          {item.shortcut.split(' ').map((k) => (
                            <kbd
                              key={k}
                              className="rounded border border-sand-300 px-1.5 py-0.5 font-mono text-[10px] text-ink-faint"
                            >
                              {k}
                            </kbd>
                          ))}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
          {flatItems.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-muted">
              No results for <span className="font-medium text-ink">{query}</span>
            </li>
          )}
        </ul>

        {/* Footer hint */}
        <div className="flex items-center gap-3 border-t border-sand-300 bg-sand-100/80 px-4 py-2 text-[11px] text-ink-faint">
          <span><kbd className="rounded border border-sand-300 px-1 font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="rounded border border-sand-300 px-1 font-mono">↵</kbd> open</span>
          <span className="ml-auto">{cmdKey()} K to close</span>
        </div>
      </div>
    </div>
  );
}

/** Thin wrapper that manages open/close state and registers the Cmd+K shortcut. */
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'k') { e.preventDefault(); setOpen((v) => !v); }
      if (e.key === 'Escape') setOpen(false);
    }
    function onCustomOpen() { setOpen(true); }
    window.addEventListener('keydown', onKey);
    document.addEventListener('mwangaza:palette', onCustomOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mwangaza:palette', onCustomOpen);
    };
  }, []);

  return (
    <>
      {children}
      {open && <CommandPalette onClose={() => setOpen(false)} />}
    </>
  );
}
