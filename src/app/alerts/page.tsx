'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, BellOff, BellRing, CalendarClock, Check, Info } from 'lucide-react';
import { useAlertStore } from '@/stores/alertStore';
import { useBondStore } from '@/stores/bondStore';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { RULE_LABELS, type AlertRule } from '@/lib/alerts';
import { notifyState, requestNotifyPermission, type NotifyState } from '@/lib/notify';
import { track } from '@/lib/analytics';
import {
  pushConfigured,
  pushState,
  subscribePush,
  syncPushRules,
  unsubscribePush,
  type PushState,
} from '@/lib/push';
import { SERVER_DELIVERABLE } from '@/lib/push-rules';
import { cn, nonNegativeNumber } from '@/lib/utils';

const LEAD_CHOICES: Record<string, number[]> = {
  'auction-window': [1, 3, 5, 7],
  'coupon-due': [1, 3, 7, 14],
  maturity: [7, 14, 30, 60],
};

function whenLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

export default function AlertsPage() {
  const { rules, events, loaded, load, setRule, refresh } = useAlertStore();
  const bonds = useBondStore((s) => s.bonds);
  const auctions = useBondStore((s) => s.auctions);
  const tbills = useBondStore((s) => s.tbills);
  const dataLoaded = useBondStore((s) => s.loaded);
  const holdings = usePortfolioStore((s) => s.holdings);
  const [permission, setPermission] = useState<NotifyState>('unsupported');
  const [push, setPush] = useState<PushState>('unconfigured');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState('');

  useEffect(() => {
    load();
    setPermission(notifyState());
    pushState().then(setPush);
  }, [load]);

  // Keep the sender's copy of the market rules in step. No-op unless subscribed.
  useEffect(() => {
    if (loaded && push === 'on') syncPushRules(rules);
  }, [rules, loaded, push]);

  // Re-evaluate whenever the rules or the underlying data change. Cheap — it is
  // arithmetic over a few hundred rows — and it keeps the list honest while the
  // reader is toggling switches.
  useEffect(() => {
    if (!loaded || !dataLoaded) return;
    refresh({ auctions, bonds, holdings, tbills }, { markSeen: true });
  }, [loaded, dataLoaded, rules, auctions, bonds, holdings, tbills, refresh]);

  const tbillRule = rules.find((r) => r.kind === 'tbill-threshold');
  const grouped = useMemo(() => {
    const week = events.filter((e) => e.daysAway <= 7);
    const later = events.filter((e) => e.daysAway > 7);
    return { week, later };
  }, [events]);

  async function ask() {
    setPermission(await requestNotifyPermission());
  }

  async function togglePush(on: boolean) {
    setPushBusy(true);
    setPushError('');
    const result = on ? await subscribePush(rules) : await unsubscribePush();
    if (on && result === 'on') track('act:alerts-enabled');
    if (result === 'denied') {
      setPushError('Your browser blocked notifications for this site. Allow them in site settings.');
    } else if (result === 'failed') {
      setPushError('Could not reach the alert service. Nothing was changed — try again shortly.');
    }
    setPush(result === 'on' || result === 'off' ? result : await pushState());
    setPermission(notifyState());
    setPushBusy(false);
  }

  const marketRulesOn = rules.filter((r) => r.enabled && SERVER_DELIVERABLE.includes(r.kind as never));

  // Where push applies it is the only consent this page should ask for —
  // subscribing requests notification permission on the way through. Rendering
  // both left two cards stacked, one saying "send me market alerts" and the
  // next "banners are on for this device", which reads as two settings for one
  // thing.
  const showPushCard = pushConfigured() && push !== 'unsupported' && push !== 'unconfigured';

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-24">
      <h1 className="font-display text-3xl font-bold text-ink">Alerts</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Dates that cost money if you miss them — a bid window closing, a coupon landing, principal
        coming back. Everything is worked out on your own device from the published calendar.
      </p>

      {/* The promise, stated exactly. An alerts page that implies more reach
          than it has would be the one dishonest screen in the app. */}
      <div className="card mt-6 border-gold-300 bg-gold-50/40">
        <div className="flex gap-3">
          <Info size={18} className="mt-0.5 shrink-0 text-gold-700" />
          <div className="text-sm text-ink-soft">
            <p className="font-semibold text-ink">How far these reach, and what we can see</p>
            <p className="mt-1">
              <strong>Market alerts</strong> — bid windows and T-Bill rates — are true for everyone,
              so we can send those to your phone even when the app is closed, if you switch them on
              below.
            </p>
            <p className="mt-2">
              <strong>Your coupons and maturities never leave this device.</strong> Working them out
              needs your holdings, and we will not hold those. They are raised when you open
              Mwangaza Yield. For a payment date you cannot afford to miss, add it to your
              phone&apos;s calendar from the{' '}
              <Link href="/portfolio/" className="text-gold-700 underline">
                portfolio
              </Link>{' '}
              page — that reminder depends on nobody.
            </p>
          </div>
        </div>
      </div>

      {/* Push, when a sender is configured for this build. */}
      {showPushCard && (
        <div className="card mt-4">
          <div className="flex flex-wrap items-center gap-3">
            {push === 'on' ? (
              <BellRing size={18} className="shrink-0 text-emerald-700" />
            ) : (
              <Bell size={18} className="shrink-0 text-gold-700" />
            )}
            <span className="min-w-0 text-sm text-ink-soft">
              {push === 'on' ? (
                <>
                  Market alerts are on for this device. We hold a delivery address and the market
                  rules you ticked — no name, no e-mail, nothing about your holdings.
                </>
              ) : (
                <>Send me market alerts even when the app is closed.</>
              )}
            </span>
            <button
              onClick={() => togglePush(push !== 'on')}
              disabled={pushBusy || (push !== 'on' && !marketRulesOn.length)}
              className={cn(
                'ml-auto rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50',
                push === 'on'
                  ? 'border border-sand-300 text-ink-soft hover:bg-sand-200'
                  : 'bg-ink text-sand-50 hover:bg-ink-soft'
              )}
            >
              {pushBusy ? 'Working…' : push === 'on' ? 'Turn off' : 'Turn on'}
            </button>
          </div>
          {push !== 'on' && !marketRulesOn.length && (
            <p className="mt-2 text-xs text-ink-muted">
              Tick a market rule below first — auction windows or a T-Bill threshold. Coupons and
              maturities cannot be sent, because we do not hold your holdings.
            </p>
          )}
          {pushError && <p className="mt-2 text-xs text-red-700">{pushError}</p>}
        </div>
      )}

      {/* Local banners only. Shown when push is unavailable — on iOS before the
          app is added to the Home Screen, in a browser without PushManager, or
          in a build with no sender configured. Then permission still buys the
          reader something: banners while the app is open. */}
      {!showPushCard && (
      <div className="card mt-4 flex flex-wrap items-center gap-3">
        {permission === 'granted' ? (
          <>
            <Bell size={18} className="text-emerald-700" />
            <span className="text-sm text-ink-soft">
              Banners are on for this device. Turn them off in your browser&apos;s site settings.
            </span>
          </>
        ) : permission === 'denied' ? (
          <>
            <BellOff size={18} className="text-ink-muted" />
            <span className="text-sm text-ink-soft">
              You blocked notifications for this site. The list below still works; to get banners
              back, allow notifications in your browser&apos;s site settings.
            </span>
          </>
        ) : permission === 'unsupported' ? (
          <>
            <BellOff size={18} className="text-ink-muted" />
            <span className="text-sm text-ink-soft">
              This browser has no notification support. The list below still works.
            </span>
          </>
        ) : (
          <>
            <Bell size={18} className="text-gold-700" />
            <span className="text-sm text-ink-soft">
              Allow notifications and these appear as banners while the app is open.
            </span>
            <button
              onClick={ask}
              className="ml-auto min-h-11 whitespace-nowrap rounded-lg bg-ink px-4 py-2 text-sm font-medium text-sand-50 hover:bg-ink-soft"
            >
              Allow notifications
            </button>
          </>
        )}
      </div>
      )}

      {/* What's due */}
      <h2 className="mt-8 font-display text-xl font-bold text-ink">What&apos;s coming</h2>
      {!events.length ? (
        <div className="card mt-3 text-sm text-ink-muted">
          Nothing due in your chosen windows. Coupon and maturity alerts need holdings — add yours on
          the{' '}
          <Link href="/portfolio/" className="text-gold-700 underline">
            portfolio page
          </Link>{' '}
          and they appear here.
        </div>
      ) : (
        <div className="mt-3 space-y-6">
          {[
            { label: 'Next 7 days', rows: grouped.week },
            { label: 'Later', rows: grouped.later },
          ]
            .filter((g) => g.rows.length)
            .map((g) => (
              <div key={g.label}>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {g.label}
                </p>
                <ul className="mt-2 space-y-2">
                  {g.rows.map((e) => (
                    <li key={e.id}>
                      <Link
                        href={e.href}
                        className="card flex gap-3 transition-colors hover:border-gold-400"
                      >
                        <CalendarClock size={18} className="mt-0.5 shrink-0 text-gold-700" />
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">{e.title}</p>
                          <p className="mt-0.5 text-sm text-ink-muted">{e.body}</p>
                        </div>
                        <span className="num ml-auto shrink-0 self-start rounded-full bg-sand-200 px-2.5 py-1 text-xs font-medium text-ink-soft">
                          {whenLabel(e.daysAway)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}

      {/* Rules */}
      <h2 className="mt-10 font-display text-xl font-bold text-ink">What to watch</h2>
      <div className="mt-3 space-y-3">
        {rules.map((rule: AlertRule) => (
          <div key={rule.id} className="card">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(ev) => setRule(rule.id, { enabled: ev.target.checked })}
                className="mt-1 h-4 w-4 shrink-0 accent-gold-600"
              />
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{RULE_LABELS[rule.kind].title}</span>
                <span className="block text-sm text-ink-muted">{RULE_LABELS[rule.kind].blurb}</span>
              </span>
              {rule.enabled && <Check size={16} className="ml-auto shrink-0 text-emerald-700" />}
            </label>

            {rule.enabled && LEAD_CHOICES[rule.kind] && (
              <div className="mt-3 flex flex-wrap items-center gap-2 pl-7">
                <span className="text-sm text-ink-muted">Tell me</span>
                <select
                  value={rule.leadDays}
                  onChange={(ev) => setRule(rule.id, { leadDays: Number(ev.target.value) })}
                  className="min-h-11 rounded-lg border border-sand-300 bg-sand-50 px-3 py-1.5 text-sm"
                >
                  {LEAD_CHOICES[rule.kind].map((d) => (
                    <option key={d} value={d}>
                      {d} day{d === 1 ? '' : 's'} ahead
                    </option>
                  ))}
                </select>
              </div>
            )}

            {rule.enabled && rule.kind === 'tbill-threshold' && tbillRule && (
              <div className="mt-3 flex flex-wrap items-center gap-2 pl-7">
                <select
                  value={rule.tenorDays}
                  onChange={(ev) =>
                    setRule(rule.id, { tenorDays: Number(ev.target.value) as 91 | 182 | 364 })
                  }
                  className="min-h-11 rounded-lg border border-sand-300 bg-sand-50 px-3 py-1.5 text-sm"
                >
                  {[91, 182, 364].map((t) => (
                    <option key={t} value={t}>
                      {t}-day
                    </option>
                  ))}
                </select>
                <span className="text-sm text-ink-muted">at or above</span>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={rule.thresholdPct ?? 12}
                  onChange={(ev) =>
                    setRule(rule.id, { thresholdPct: nonNegativeNumber(ev.target.value, 12) })
                  }
                  className="num w-24 rounded-lg border border-sand-300 bg-sand-50 px-3 py-1.5 text-sm"
                />
                <span className="text-sm text-ink-muted">%</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-ink-muted">
        Rules and delivery history stay on this device. Nothing is sent anywhere, and no account is
        involved.
      </p>
    </div>
  );
}
