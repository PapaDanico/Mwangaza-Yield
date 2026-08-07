import { MessageCircle } from 'lucide-react';
import { PESA_SMART_CHANNEL, PESA_SMART_NAME } from '@/lib/share';

/**
 * "Rates changed — here is where we say so", offered AFTER a result exists.
 *
 * WHY THIS AND NOT AN EMAIL FORM
 *
 * The obvious way to bring a reader back is to take their email address. Two
 * reviews recommended exactly that. It was declined on 2026-08-07, and the
 * reason is written into the privacy notice rather than inferred:
 *
 *   Until July 2026 turning on alerts issued a push endpoint ... an endpoint
 *   identifies a specific person's device, and that makes it personal data
 *   whatever else it does not contain. It is gone. ... no question about
 *   whether we are a data controller — because we hold no personal data at all.
 *
 * An email address is more identifying than a push endpoint, not less. A
 * capture form would reverse a deliberate decision, make a published Data
 * Protection Act s.29 notice false, and put Mwangaza Digital Ltd back in scope
 * as a data controller — to solve a problem the channel already solves.
 *
 * WhatsApp does not show channel admins who follows. We cannot see a number
 * and are given no list, so following costs the reader nothing and leaves us
 * holding nothing. That is the whole argument for this component existing in
 * the shape it does.
 *
 * WHERE IT MAY APPEAR, WHICH IS NARROWER THAN IT LOOKS
 *
 * Only where the reader has ALREADY been given something: a computed ladder, a
 * bill comparison, an auction result. Never on a landing page, never in front
 * of somebody who has been given nothing yet, and never as a modal. Asking for
 * a reader's attention before helping them is the same move as asking for
 * their money before helping them, with a smaller price tag — and JiPange's
 * mission rules already forbid the second in so many words.
 *
 * follow-channel.test.ts enforces the placement rule, because "put it after a
 * result" is a habit until something checks it.
 *
 * WHAT THE COPY MAY NOT SAY
 *
 * Never that we will tell a reader about THEIR coupons, maturities or
 * holdings. Doing that needs data this app refuses to hold, and the alerts
 * page promises on the same visit that those figures never leave the device.
 * pesa-smart-channel.test.ts fails the build on that phrasing.
 *
 * It is a server component on purpose: nothing here reacts to anything, and a
 * `'use client'` boundary around a static link would cost hydration for a
 * paragraph of text.
 */
export default function FollowChannel({ what }: { what: string }) {
  return (
    <p className="mt-4 border-t border-sand-200 pt-3 text-sm text-ink-soft">
      <MessageCircle size={14} className="mr-1.5 inline align-[-2px] text-gold-700" />
      {what} move with each auction.{' '}
      <a
        href={PESA_SMART_CHANNEL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-gold-700 underline underline-offset-2"
      >
        Follow {PESA_SMART_NAME} on WhatsApp
      </a>{' '}
      and we post when they do — market news only, for everyone. Following tells
      us nothing about you: WhatsApp does not show us who follows a channel, so
      there is no number to give and no list to keep. Nothing you have entered
      on this page is sent anywhere.
    </p>
  );
}
