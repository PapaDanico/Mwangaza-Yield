import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SUPPORT_EMAIL } from '../../src/lib/share';

/**
 * The privacy notice must name who "we" is.
 *
 * It said "we" and "us" throughout, named nobody, and ended by directing
 * readers to the Office of the Data Protection Commissioner. Sending somebody
 * to complain about an entity the notice will not identify is not a complaint
 * route — and section 29 of the Data Protection Act, 2019 makes identifying
 * the controller part of the duty this page exists to discharge. The s.26
 * rights listed further down are unusable without it: you cannot ask a pronoun
 * for your data.
 *
 * Deliberately NOT asserted here: a registration number, a registered office,
 * or any ODPC registration status. Those are still being settled, and a
 * controller implying a registration it does not hold would be a worse defect
 * than a silent one. A name and a working contact route are what s.29 turns
 * on. When the rest is settled, extend this.
 */
const PRIVACY = readFileSync(new URL('../../src/app/privacy/page.tsx', import.meta.url), 'utf8');

/** Comments stripped, so the note explaining the rule cannot satisfy the rule. */
const shipped = PRIVACY.replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('the privacy notice identifies its data controller', () => {
  it('names the operating entity in the rendered page', () => {
    expect(
      shipped,
      'the notice points readers at the ODPC without saying who they would be complaining about'
    ).toContain('Danico Ventures');
  });

  it('gives a contact route in the same breath', () => {
    // A name with no address is only half of what s.29 asks for, and the whole
    // of what a reader exercising a right actually needs.
    expect(shipped).toContain('SUPPORT_EMAIL');
    expect(SUPPORT_EMAIL).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
  });

  it('claims no registration it cannot evidence', () => {
    /* The failure mode in the other direction. Nobody is going to invent a
     * company number on purpose — but "ODPC registered" is the kind of phrase
     * that gets added because it reads reassuringly, and it is a regulatory
     * claim, not a reassurance. */
    for (const claim of [
      /ODPC[-\s]registered/i,
      /registered with the Office of the Data Protection/i,
      /registration (?:number|no\.)\s*:?\s*[A-Z0-9]/i,
    ]) {
      expect(
        shipped.match(claim)?.[0],
        'the notice asserts a registration status that has not been established'
      ).toBeUndefined();
    }
  });

  it('still routes complaints to the ODPC, which is the point of naming anyone', () => {
    expect(shipped).toContain('odpc.go.ke');
  });

  it('publishes company facts a reader can check, and none of the rest', () => {
    /* A registration number is verifiable at the BRS; a name alone is not. The
     * certificate also carries a director's name, a shareholding, and a
     * "P.O. Box" field holding a mobile number — the last is the trap, because
     * a government form labelled it as an address. */
    expect(shipped).toContain('PVT-EYUM572');
    expect(shipped, 'a Kenyan mobile number is present').not.toMatch(/\b07\d{8}\b/);
    expect(shipped, 'the director is named').not.toMatch(/NGONGA|Ng&apos;ong&apos;a/i);
    expect(shipped, 'shareholding detail is present').not.toMatch(/ORDINARY|share capital/i);
    /* The registered office is a home-adjacent address the operator asked not
     * to publish. It stays on the BRS record, reachable by company number,
     * which is the right place for it. */
    expect(shipped, "the certificate's registered office is published").not.toMatch(
      /Ongata Rongai|Kitengela Bypass|Athi River/i
    );
  });
});
