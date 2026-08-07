import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The security headers in netlify.toml — and the drift that let them go missing.
 *
 * WHY THIS EXISTS
 *
 * JiPange carried X-Frame-Options, nosniff, Referrer-Policy and
 * Permissions-Policy for some time. Mwangaza — the product that shows people
 * money figures they may act on — had NONE of them. Not a weakened set: no
 * security headers block in netlify.toml at all.
 *
 * Nothing was wrong with either decision when it was made. The rules were
 * agreed once, applied to one repository, and the other was simply never
 * edited. Two codebases by the same hand drift apart on things both had
 * already decided, and nothing fails when they do — which is precisely why it
 * survived until somebody read both files side by side.
 *
 * WHAT THIS FILE ASSERTS, AND WHAT IT DELIBERATELY DOES NOT
 *
 * It asserts the headers that ARE correct are present, and that
 * X-XSS-Protection stays gone. It does NOT assert a Content-Security-Policy,
 * because there is not one, and a test demanding one would either fail
 * permanently or be satisfied by a policy that breaks production.
 *
 * X-XSS-Protection was removed on purpose and the reasoning is subtle enough
 * that somebody will re-add it in good faith: it looks like a security header,
 * a scanner lists its absence, and "1; mode=block" reads as strictly
 * protective. It is not. It enabled a legacy browser XSS auditor no current
 * browser ships — Chrome removed it, Edge followed, Firefox never implemented
 * it. Historically it was worse than inert: the auditor guessed which parts of
 * a response were reflected input and neutralised them, and that guess was
 * itself exploitable. Sending it advertises a protection that does not exist.
 *
 * Both SECURITY.md files state the CSP gap and the deliberate absence. This is
 * what keeps those statements true.
 */

const ROOT = process.cwd();
const TOML_PATH = join(ROOT, 'netlify.toml');
const TOML = existsSync(TOML_PATH) ? readFileSync(TOML_PATH, 'utf8') : '';

/** Header lines only — comments explaining a header must not satisfy a check. */
const directives = TOML.split('\n')
  .filter((l) => !l.trim().startsWith('#'))
  .join('\n');

describe('netlify.toml security headers', () => {
  it('is the real file, not an empty read', () => {
    // Without this every assertion below passes against an empty string — the
    // vacuous-guard failure this repository has already shipped once.
    expect(TOML.length).toBeGreaterThan(500);
    expect(TOML).toContain('[[headers]]');
    expect(directives).toContain('[[headers]]');
  });

  it('applies a header block to every path', () => {
    expect(directives).toMatch(/for\s*=\s*"\/\*"/);
  });

  it('sets the four headers JiPange already sets', () => {
    // Named individually rather than counted, so a partial deletion is caught
    // by name instead of a number that still looks plausible.
    expect(directives).toMatch(/X-Frame-Options\s*=\s*"SAMEORIGIN"/);
    expect(directives).toMatch(/X-Content-Type-Options\s*=\s*"nosniff"/);
    expect(directives).toMatch(/Referrer-Policy\s*=\s*"strict-origin-when-cross-origin"/);
    expect(directives).toMatch(/Permissions-Policy\s*=/);
  });

  it('does not send X-XSS-Protection', () => {
    // Matched against non-comment lines only: the block above EXPLAINS the
    // header at length, and a naive search of the whole file would find it
    // there and fail on its own documentation.
    expect(directives).not.toMatch(/X-XSS-Protection/);
    // The explanation must survive, though — a future reader deleting the
    // comment loses the reason and re-adds the header.
    expect(TOML).toContain('X-XSS-Protection');
  });

  it('keeps the rates feed readable cross-origin', () => {
    // The feed is published FOR other people to read. A blanket header block
    // added later must not quietly close it — that would break every consumer
    // while every test here still passed.
    expect(directives).toMatch(/Access-Control-Allow-Origin\s*=\s*"\*"/);
  });

  it('does not claim a Content-Security-Policy it has not got', () => {
    // If a CSP is ever added this test should be REPLACED with one that checks
    // the policy is correct, not deleted quietly. Until then, asserting the
    // absence keeps SECURITY.md honest: the gap is documented as a gap.
    const hasCsp = /Content-Security-Policy\s*=/.test(directives);
    expect(
      hasCsp,
      'a CSP appeared in netlify.toml — update SECURITY.md in both repos and '
        + 'replace this assertion with one that checks the policy itself',
    ).toBe(false);
  });
});
