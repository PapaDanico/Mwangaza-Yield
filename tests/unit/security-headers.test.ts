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

  /**
   * REPLACED, NOT DELETED.
   *
   * This slot held `does not claim a Content-Security-Policy it has not got`,
   * which asserted the ABSENCE of a policy and said of itself: "If a CSP is
   * ever added this test should be REPLACED with one that checks the policy is
   * correct, not deleted quietly." A CSP has been added, so here is that test.
   */
  describe('the Content-Security-Policy', () => {
    const csp = (() => {
      const block = TOML.match(/Content-Security-Policy\s*=\s*"""([\s\S]*?)"""/);
      const line = TOML.match(/Content-Security-Policy\s*=\s*"([^"]+)"/);
      const raw = block ? block[1] : line ? line[1] : '';
      return raw.replace(/\\\s*\n/g, '').replace(/\s+/g, ' ').trim();
    })();

    it('exists, so the assertions below are not vacuous', () => {
      expect(csp.length).toBeGreaterThan(60);
      expect(csp).toContain('default-src');
    });

    /* The directives that need no nonce, break nothing, and were missing for
     * as long as the header was. Each blocks a real attack: a <base> tag
     * repointing every relative URL, a form rewritten to post somewhere else,
     * a plugin payload, and framing by another origin. */
    it.each([
      ["default-src 'self'", 'an unlisted resource type falls back to same-origin'],
      ["object-src 'none'", 'plugin-based payloads'],
      ["base-uri 'self'", 'a <base> tag repointing every relative URL'],
      ["form-action 'self'", 'a form rewritten to exfiltrate to another origin'],
      ["frame-ancestors 'self'", 'clickjacking, and stronger than X-Frame-Options'],
    ])('carries %s', (directive) => {
      expect(csp).toContain(directive);
    });

    it('never permits unsafe-eval, anywhere', () => {
      // Nothing here needs it, and it re-opens the whole class of injection
      // the rest of the policy is trying to close.
      expect(csp).not.toContain('unsafe-eval');
    });

    it('never wildcards a fetch directive', () => {
      // `*` in script-src or default-src would make the policy decorative.
      expect(csp).not.toMatch(/(?:default|script|connect|object)-src[^;]*\*/);
    });

    /**
     * THE ONE LOOSE DIRECTIVE MUST STAY DOCUMENTED.
     *
     * script-src carries 'unsafe-inline', so the policy does NOT stop injected
     * script. That is a real limit, and the failure mode to guard against is
     * not the limit itself — it is the limit quietly outliving its disclosure,
     * leaving SECURITY.md claiming a protection the header does not provide.
     */
    it('discloses that script-src permits inline script', () => {
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      const security = readFileSync(join(process.cwd(), 'SECURITY.md'), 'utf8');
      expect(
        security,
        "script-src permits inline script and SECURITY.md no longer says so — "
          + 'the header and the disclosure have drifted apart',
      ).toMatch(/unsafe-inline/);
    });

    it('is verified against the built site by CI, not merely reviewed', () => {
      // A CSP cannot be signed off by reading it: the directive that breaks a
      // page looks exactly like the one that does not. scripts/verify-csp.mjs
      // serves ./out under this exact string and fails on any violation.
      const ci = readFileSync(join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');
      expect(ci).toContain('verify:csp');
    });
  });
});
