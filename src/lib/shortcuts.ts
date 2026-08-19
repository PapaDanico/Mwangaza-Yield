/**
 * Keyboard shortcut registry.
 *
 * Every shortcut the app recognises is defined here as a record rather than
 * scattered across components. Components register handlers via
 * `useShortcut`; the help modal reads the registry to display them. Nothing
 * in this file is React — the hooks live in components, the data lives here.
 */

import { NAVIGATION_SHORTCUT_ROUTES } from './routes';

export interface ShortcutDef {
  /** Keys to display in the help modal, e.g. ['Cmd', 'K'] or ['G', 'D']. */
  keys: string[];
  description: string;
  category: 'navigation' | 'actions' | 'tools';
}

/** The canonical shortcut registry. Keys map to handler IDs that components subscribe to. */
export const SHORTCUTS: Record<string, ShortcutDef> = {
  'palette':          { keys: ['Cmd', 'K'], description: 'Open command palette', category: 'tools' },
  'help':             { keys: ['?'], description: 'Show keyboard shortcuts', category: 'tools' },
  ...Object.fromEntries(
    NAVIGATION_SHORTCUT_ROUTES.map((route) => [
      `nav:${route.id}`,
      {
        keys: route.shortcutKeys!,
        description: `Go to ${route.label}`,
        category: 'navigation' as const,
      },
    ])
  ),
  'action:receipt':   { keys: ['R'], description: 'Generate receipt for current result', category: 'actions' },
  'escape':           { keys: ['Esc'], description: 'Close modal / palette', category: 'tools' },
};

/** Normalised platform key label: "⌘" on Mac, "Ctrl" elsewhere. */
export function cmdKey(): string {
  if (typeof navigator === 'undefined') return 'Ctrl';
  return /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent)
    ? '⌘'
    : 'Ctrl';
}

/** Returns a display label for a shortcut definition, e.g. "⌘ K" or "G D". */
export function formatShortcut(def: ShortcutDef): string {
  return def.keys
    .map((k) => (k === 'Cmd' ? cmdKey() : k))
    .join(' ');
}
