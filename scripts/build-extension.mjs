// Builds the browser extension into build-extension/ (load it unpacked, or zip it for a store).
//   node scripts/build-extension.mjs [--watch] [--dev]
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'extension');
const out = join(root, 'build-extension');
const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');

const entries = ['background', 'hook', 'relay', 'devtools', 'panel', 'history', 'popup'];

const options = {
  entryPoints: Object.fromEntries(entries.map(name => [name, join(src, 'src', `${name}.js`)])),
  outdir: out,
  bundle: true,
  format: 'iife',
  target: ['chrome111'],
  loader: { '.js': 'jsx' },
  define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production') },
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
};

async function copyStatic() {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(src, 'manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  await writeFile(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const file of ['devtools.html', 'panel.html', 'history.html', 'popup.html']) {
    await cp(join(src, file), join(out, file));
  }
  await cp(join(src, 'icons'), join(out, 'icons'), { recursive: true });
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await copyStatic();
if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log(`Watching. Load ${out} as an unpacked extension and reload it after changes.`);
} else {
  await build(options);
  console.log(`Built ${out}`);
}
