import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const out = join(root, 'dist');
const siteKey = process.env.TURNSTILE_SITE_KEY;
if (!siteKey || !/^0x[\w-]+$/.test(siteKey)) {
  throw new Error('TURNSTILE_SITE_KEY must be configured for a deployable build.');
}

const excluded = new Set(['.git', '.github', 'dist', 'node_modules', 'scripts', 'tests', 'work']);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (excluded.has(entry.name) || ['package.json', 'package-lock.json', 'playwright.config.js', 'wrangler.jsonc'].includes(entry.name)) continue;
  await cp(join(root, entry.name), join(out, entry.name), { recursive: true });
}

async function replaceHtml(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await replaceHtml(path);
    else if (extname(entry.name) === '.html') {
      const source = await readFile(path, 'utf8');
      await writeFile(path, source.replaceAll('REPLACE_WITH_CLOUDFLARE_TURNSTILE_SITE_KEY', siteKey));
    }
  }
}
await replaceHtml(out);
console.log(`Built static site at ${relative(root, out)}`);
