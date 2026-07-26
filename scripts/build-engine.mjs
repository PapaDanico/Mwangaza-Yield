/**
 * Build the licensable engine: dist/engine, importable from plain Node.
 *
 * tsc emits the sources' extensionless relative imports verbatim, which
 * TypeScript resolves and Node's ESM loader does not. Rather than force `.js`
 * extensions into app source (where the Next bundler neither needs nor wants
 * them), this script appends them to relative specifiers in the emitted .js
 * only. The .d.ts files stay extensionless — TypeScript consumers resolve
 * those fine.
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

execSync('npx tsc -p tsconfig.engine.json', { stdio: 'inherit' });

const fix = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) fix(p);
    else if (entry.name.endsWith('.js')) {
      const src = readFileSync(p, 'utf8');
      writeFileSync(p, src.replace(/(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g, (m, a, spec, z) =>
        spec.endsWith('.js') ? m : `${a}${spec}.js${z}`));
    }
  }
};
fix('dist/engine');

writeFileSync(
  'dist/engine/package.json',
  JSON.stringify(
    {
      name: '@mwangaza/engine',
      version: '0.1.0',
      description:
        'Kenyan government bond analytics: pricing, sale evaluation, auction bid guidance. Pure functions, no I/O.',
      type: 'module',
      main: './lib/engine.js',
      types: './lib/engine.d.ts',
      exports: { '.': { types: './lib/engine.d.ts', import: './lib/engine.js' } },
      license: 'UNLICENSED',
      private: true,
    },
    null,
    2
  ) + '\n'
);

console.log('dist/engine built');
