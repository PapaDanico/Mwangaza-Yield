import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

/**
 * The licence is a ONE-WAY DOOR, so it gets a test.
 *
 * A permissive grant cannot be taken back. Publish one version under MIT and
 * that version is MIT for everyone, for ever, whatever the next commit says —
 * which would cut directly across /licensing, where the analytics engine is
 * offered commercially to SACCOs, fund managers and advisers.
 *
 * This is not a hypothetical drift. An external review recommended adding
 * "MIT, AGPL, or custom" on the assumption that this is an open-source
 * project, and that recommendation was reasonable given a repository with no
 * LICENSE file and a one-line README. The next such review will be made to the
 * same repository by somebody with no memory of this decision, and the natural
 * way to act on it is `npx license mit`.
 *
 * So the decision is written down where a test can see it. Nothing here
 * forbids changing the licence — it forbids changing it BY ACCIDENT. Deleting
 * this file is a deliberate act; pasting MIT over the LICENSE is not.
 */

const LICENCE_PATH = 'LICENSE';

describe('the licence', () => {
  it('exists at all', () => {
    // "No file" and "deliberately closed" look identical to a reader, and only
    // one of them is true. That ambiguity is what this file removes.
    expect(existsSync(LICENCE_PATH)).toBe(true);
  });

  const raw = existsSync(LICENCE_PATH) ? readFileSync(LICENCE_PATH, 'utf8') : '';
  // Collapsed to single spaces before matching. The file is hard-wrapped at 79
  // columns, so every phrase below straddles a newline somewhere, and a test
  // that failed when a sentence was re-wrapped would be testing the layout
  // rather than the terms.
  const text = raw.replace(/\s+/g, ' ');

  it('is a real licence file, not a stub', () => {
    // Without this, every assertion below passes against an empty string.
    expect(text.length).toBeGreaterThan(400);
  });

  it('reserves all rights', () => {
    expect(text).toMatch(/all rights reserved/i);
  });

  it('carries no permissive grant', () => {
    // The opening words of MIT, ISC and BSD respectively. Any of them appearing
    // here means somebody granted rights this project intends to sell.
    for (const grant of [
      /permission is hereby granted, free of charge/i,
      /permission to use, copy, modify, and\/or distribute this software/i,
      /redistribution and use in source and binary forms/i,
      /licensed under the apache license/i,
    ]) {
      expect(text, `a permissive grant appears in ${LICENCE_PATH}`).not.toMatch(grant);
    }
  });

  it('says plainly that it is not open source', () => {
    // A reader skimming for a familiar licence name should hit this first.
    expect(text).toMatch(/not an open-source licence/i);
  });

  it('does not claim ownership of the publishers\' data', () => {
    // public/data is derived from CBK, Treasury, KNBS and World Bank releases.
    // Reserving rights over the code must not read as reserving rights over
    // their figures, which would be both false and a bad-faith claim.
    expect(text).toMatch(/Central Bank of Kenya/);
    expect(text).toMatch(/copyright in the underlying publications belongs to those bodies/i);
  });

  it('restates the refusal to touch exchange data', () => {
    // no-exchange-data.test.ts enforces this across the app. The licence is
    // where an institution's counsel looks for it, so it is stated here too —
    // and the two must not drift apart.
    expect(text).toMatch(/no nairobi securities exchange data/i);
  });

  it('disclaims advice and warranty', () => {
    expect(text).toMatch(/not as investment advice/i);
    expect(text).toMatch(/without warranty/i);
  });
});
