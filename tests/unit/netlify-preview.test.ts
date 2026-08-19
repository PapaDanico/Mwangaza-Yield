import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8');

describe('Netlify preview deployments', () => {
  it('does not cancel deploy-preview builds', () => {
    expect(config).not.toMatch(/\[context\.deploy-preview\][\s\S]*?ignore\s*=\s*["']exit 0["']/);
  });

  it('does not cancel branch-deploy builds', () => {
    expect(config).not.toMatch(/\[context\.branch-deploy\][\s\S]*?ignore\s*=\s*["']exit 0["']/);
  });
});
