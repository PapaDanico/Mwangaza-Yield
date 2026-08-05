import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * No personal data in anything this repository tracks.
 *
 * This is not hypothetical and it is not about a hypothetical user. The
 * securities register at backend/reference/dhowcsd-securities.csv was committed
 * in #35 with the DhowCSD export's trailer still attached, so the repository —
 * which is PUBLIC — carried the owner's full name, email address, home area,
 * phone number, CDS/CUI number and KRA PIN for three days.
 *
 * A KRA PIN is an identity credential in Kenya. Beside a name and a phone
 * number it is the raw material for impersonation at KRA, at a bank, or on
 * DhowCSD itself. And it sat inside a product whose entire promise is that your
 * data never leaves your device.
 *
 * Nobody was careless. A DhowCSD export looks like a data file, its first 643
 * lines ARE a data file, and the six lines at the bottom are easy not to read.
 * That is exactly why this is a machine's job: the trailer is a fixed shape,
 * and a scan costs milliseconds.
 *
 * WHY IT SCANS TRACKED FILES RATHER THAN A DIRECTORY
 * --------------------------------------------------
 * `.gitignore` protects the raw exports we know about. This catches the ones
 * nobody thought to ignore — a new export saved under a different name, a
 * fixture pasted into a test, a debug dump left in public/. If git tracks it,
 * it can reach GitHub, so git's own file list is the right thing to walk.
 */

/** Shapes that identify a person, not a security. */
const PATTERNS: { label: string; re: RegExp }[] = [
  // The DhowCSD trailer, line-anchored so ordinary prose cannot trip it.
  { label: 'DhowCSD export trailer', re: /^(?:"?\s*)(?:KRA PIN|Cui|Full Name|IBAN)\s*:/im },
  // A Kenyan KRA PIN: letter, nine digits, letter.
  { label: 'KRA PIN', re: /\b[A-Z]\d{9}[A-Z]\b/ },
  // A CUI/CDS number as DhowCSD writes it.
  { label: 'CDS/CUI number', re: /\bN\d{8}\b/ },
  /* Any real-looking email address.
   *
   * The domain part must allow MULTIPLE labels. A single-label pattern matched
   * "budget@treasury.go" out of "budget@treasury.go.ke" — a truncated value
   * that then failed to equal its own allowlist entry, so a benign address
   * reported as a leak forever. A guard that cries wolf gets switched off. */
  {
    label: 'email address',
    re: /\b[\w.+-]+@(?![\w-]*example\.)[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}\b/i,
  },
];

/**
 * Known-good values, allowlisted INDIVIDUALLY rather than by file.
 *
 * Pardoning a whole file is how a guard quietly stops guarding: the fixture
 * that legitimately contains a fake KRA PIN is also the file most likely to
 * receive a real one by copy-paste. So each benign value is named, and anything
 * else of the same shape fails wherever it appears — including inside these
 * very files.
 *
 * The emails are organisational contacts that are meant to be public: the
 * Treasury's budget desk, the exchange's data-licensing desk, and the
 * business's own address. None is a person.
 */
const KNOWN_GOOD = new Set([
  'budget@treasury.go.ke',
  'dataservices@nse.co.ke',
  'info@mwangazadigital.org',
  // The sister product's public contact. The partnership deck this repository
  // ships names it, and tests/unit/partnership-deck.test.ts checks the deck
  // against it — so the address has to be nameable here. Organisational, not
  // a person, same as the others above.
  'hello@jipangefinance.org',
  'sample@example.com',
  /* npm's own deprecation notice for glob, which quotes the maintainer's
   * contact address: "Support ... may be purchased ... by contacting i@izs.me".
   * It entered package-lock.json when ESLint was added — glob@7 arrives
   * transitively through file-entry-cache -> flat-cache -> rimraf — and it is
   * the only address anywhere in the lockfile.
   *
   * Named as a value rather than pardoning package-lock.json, per the rule
   * above: a lockfile is exactly the sort of large machine-written file where a
   * blanket exemption would hide the next thing. If more registry addresses
   * appear they will fail here and be judged one at a time. */
  'i@izs.me',
  // Invented placeholders in the DhowCSD parser fixtures. Structurally valid
  // so the parser is genuinely exercised; deliberately all-zero so no real
  // person is behind them.
  'A000000000X',
  'N00000000',
]);

/** Only this file, which must quote the patterns in order to define them. */
const ALLOWED = new Set(['tests/unit/no-personal-data.test.ts']);

/** Binary and vendored paths where a byte pattern would be meaningless. */
const SKIP_RE = /(^|\/)(node_modules|\.next|out|dist|coverage)\//;
const BINARY_RE = /\.(png|jpg|jpeg|webp|ico|svg|pdf|woff2?|ttf|zip|gz)$/i;

describe('nothing personal reaches the repository', () => {
  const root = new URL('../../', import.meta.url).pathname;
  const tracked = execSync('git ls-files', { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !SKIP_RE.test(f) && !BINARY_RE.test(f) && !ALLOWED.has(f));

  it('walks a real, non-empty file list', () => {
    // A scan of nothing passes silently, which is the failure this whole file
    // exists to prevent in the first place.
    expect(tracked.length, 'git ls-files returned nothing — the scan is vacuous').toBeGreaterThan(
      100
    );
  });

  it('contains no personal identifiers in any tracked file', () => {
    const hits: string[] = [];
    for (const file of tracked) {
      let text: string;
      try {
        text = readFileSync(join(root, file), 'utf8');
      } catch {
        continue; // unreadable or vanished; not this test's business
      }
      for (const { label, re } of PATTERNS) {
        const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
        for (const m of text.matchAll(global)) {
          const value = m[0].trim();
          if (KNOWN_GOOD.has(value)) continue;
          hits.push(`${file}: ${label} — ${JSON.stringify(value.slice(0, 48))}`);
        }
      }
    }
    expect(hits, `personal data found in tracked files:\n${hits.join('\n')}`).toEqual([]);
  });

  /**
   * The specific file that was wrong, checked by shape rather than by content.
   *
   * A future export dropped in wholesale would restore the trailer, and the
   * generic scan above would catch it. This says the more precise thing: the
   * register must be instrument rows and nothing else.
   */
  it('keeps the securities register to instrument rows only', () => {
    const csv = readFileSync(join(root, 'backend/reference/dhowcsd-securities.csv'), 'utf8');
    const lines = csv.trim().split('\n');
    expect(lines.length, 'the register looks empty').toBeGreaterThan(500);
    for (const [i, line] of lines.slice(1).entries()) {
      const cols = line.split(',');
      expect(
        cols.length,
        `line ${i + 2} has ${cols.length} fields, not an instrument row: ${line.slice(0, 60)}`
      ).toBeGreaterThanOrEqual(8);
    }
  });
});
