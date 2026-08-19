export type JourneyStage = 'discover' | 'analyze' | 'plan' | 'execute' | 'track';

export interface AppRoute {
  id: string;
  href: string;
  label: string;
  commandLabel?: string;
  journeyStage?: JourneyStage;
  showInPrimaryNav?: boolean;
  showInMobileNav?: boolean;
  showInCommandPalette?: boolean;
  shortcutKeys?: string[];
}

export const APP_ROUTES: AppRoute[] = [
  { id: 'dashboard', href: '/dashboard/', label: 'Dashboard', journeyStage: 'discover', showInPrimaryNav: true, showInMobileNav: true, showInCommandPalette: true, shortcutKeys: ['G', 'D'] },
  { id: 'goals', href: '/goals/', label: 'Goals', journeyStage: 'plan', showInPrimaryNav: true, showInMobileNav: true, showInCommandPalette: true, shortcutKeys: ['G', 'G'] },
  { id: 'tbills', href: '/tbills/', label: 'T-Bills', journeyStage: 'analyze', showInPrimaryNav: true, showInMobileNav: true, showInCommandPalette: true, shortcutKeys: ['G', 'T'] },
  { id: 'ladder', href: '/ladder/', label: 'Ladder', journeyStage: 'plan', showInPrimaryNav: true, showInMobileNav: true, showInCommandPalette: true },
  { id: 'calculator', href: '/calculator/', label: 'Calculator', journeyStage: 'analyze', showInPrimaryNav: true, showInMobileNav: false, showInCommandPalette: true, shortcutKeys: ['G', 'C'] },
  { id: 'auctions', href: '/auctions/', label: 'Auctions', journeyStage: 'analyze', showInPrimaryNav: true, showInMobileNav: true, showInCommandPalette: true, shortcutKeys: ['G', 'A'] },
  { id: 'portfolio', href: '/portfolio/', label: 'Portfolio', journeyStage: 'track', showInPrimaryNav: true, showInMobileNav: true, showInCommandPalette: true, shortcutKeys: ['G', 'P'] },
  { id: 'macro', href: '/macro/', label: 'Economic Context', commandLabel: 'Macro', journeyStage: 'analyze', showInCommandPalette: true, shortcutKeys: ['G', 'M'] },
  { id: 'prices', href: '/prices/', label: 'Price Book', journeyStage: 'execute', showInCommandPalette: true, shortcutKeys: ['G', 'I'] },
  { id: 'learn', href: '/learn/', label: 'Learn', journeyStage: 'discover', showInCommandPalette: true, shortcutKeys: ['G', 'L'] },
  { id: 'yield-curve', href: '/yield-curve/', label: 'Yield Curve', journeyStage: 'analyze', showInCommandPalette: true },
  { id: 'alerts', href: '/alerts/', label: 'Alerts', journeyStage: 'track' },
  { id: 'sell', href: '/sell/', label: 'Sell Evaluator', journeyStage: 'execute' },
  { id: 'receipts', href: '/receipts/', label: 'Receipts' },
  { id: 'pwa-debug', href: '/_debug/pwa/', label: 'PWA Diagnostics' },
  { id: 'privacy', href: '/privacy/', label: 'Privacy' },
  { id: 'terms', href: '/terms/', label: 'Terms' },
  { id: 'disclaimer', href: '/disclaimer/', label: 'Disclaimer' },
  { id: 'faq', href: '/faq/', label: 'FAQ' },
  { id: 'about', href: '/about/', label: 'About' },
  { id: 'sources', href: '/sources/', label: 'Sources' },
  { id: 'glossary', href: '/glossary/', label: 'Glossary' },
  { id: 'support', href: '/support/', label: 'Support' },
  { id: 'licensing', href: '/licensing/', label: 'Licensing' },
  { id: 'feed', href: '/feed/', label: 'Feed' },
  { id: 'offline', href: '/offline/', label: 'Offline' },
  { id: 'home', href: '/', label: 'Home' },
];

export const PRIMARY_NAV_ROUTES = APP_ROUTES.filter((route) => route.showInPrimaryNav);
export const MOBILE_NAV_ROUTES = APP_ROUTES.filter((route) => route.showInMobileNav);
export const COMMAND_PALETTE_ROUTES = APP_ROUTES.filter((route) => route.showInCommandPalette);

export const ROUTE_LABELS = Object.fromEntries(
  APP_ROUTES.map((route) => [route.href, route.label])
) as Record<string, string>;

export const NAVIGATION_SHORTCUT_ROUTES = APP_ROUTES.filter((route) => route.shortcutKeys?.length);

export const JOURNEY_STAGES = [
  { label: 'Discover', key: 'discover' },
  { label: 'Analyze', key: 'analyze' },
  { label: 'Plan', key: 'plan' },
  { label: 'Execute', key: 'execute' },
  { label: 'Track', key: 'track' },
] as const;
