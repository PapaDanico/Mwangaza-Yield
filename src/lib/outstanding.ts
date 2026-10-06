import type { Bond } from '@/types/bond';

/**
 * Bonds a reader can still buy, price or sell: maturity after `asOf`.
 *
 * bonds.json keeps matured bonds on purpose — the forecast backtests replay
 * auctions against their coupon and maturity, and two tests fail without
 * them. So the archive stays whole and the pickers filter here. Found 6 Oct
 * 2026 by reconciling the DhowCSD securities register: FXD1/2016/010 matured
 * 17 Aug and was still offered on /prices/, /calculator/ and /sell/.
 */
export function outstanding<T extends Pick<Bond, 'maturityDate'>>(bonds: T[], asOf: Date = new Date()): T[] {
  return bonds.filter((b) => new Date(`${b.maturityDate}T00:00:00Z`) > asOf);
}
