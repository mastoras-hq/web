import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = process.cwd();
const out = join(root, 'dist');
const siteKey = process.env.TURNSTILE_SITE_KEY;
const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const apiOrigin = process.env.API_ORIGIN;
const turnstileTestSiteKeys = new Set([
  // Cloudflare's documented visible test widget that always passes.
  '1x00000000000000000000AA',
]);
if (!siteKey || (!/^0x[\w-]+$/.test(siteKey) && !turnstileTestSiteKeys.has(siteKey))) {
  throw new Error('TURNSTILE_SITE_KEY must be configured for a deployable build.');
}
for (const [name, value] of Object.entries({ SUPABASE_URL: supabaseUrl, API_ORIGIN: apiOrigin })) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be configured as a valid HTTPS URL.`);
  }
  if (parsed.protocol !== 'https:' || parsed.origin !== value) {
    throw new Error(`${name} must be configured as an HTTPS origin without a path.`);
  }
}
if (!supabasePublishableKey || !/^[A-Za-z0-9._-]{20,}$/.test(supabasePublishableKey)) {
  throw new Error('SUPABASE_PUBLISHABLE_KEY must be configured for a deployable build.');
}

const excluded = new Set([
  '.git', '.github', 'dist', 'node_modules', 'scripts', 'tests', 'work',
  'mastoras', 'package.json', 'package-lock.json', 'playwright.config.js',
  'wrangler.jsonc', 'DEPLOYMENT.md',
]);
await rm(out, { recursive: true, force: true });
async function copyPublicFiles(source, destination, isRoot = false) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || extname(entry.name) === '.md') continue;
    if (isRoot && excluded.has(entry.name)) continue;
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isDirectory()) await copyPublicFiles(sourcePath, destinationPath);
    else await cp(sourcePath, destinationPath);
  }
}
await copyPublicFiles(root, out, true);

const replacements = new Map([
  ['REPLACE_WITH_CLOUDFLARE_TURNSTILE_SITE_KEY', siteKey],
  ['https://pxrfgltynqdceyozpovq.supabase.co', supabaseUrl],
  ['MASTORAS_SUPABASE_PUBLISHABLE_KEY', supabasePublishableKey],
  ['https://api.mastoras.uk', apiOrigin],
]);

async function injectPublicConfiguration(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await injectPublicConfiguration(path);
    else if (['_headers'].includes(entry.name) || ['.html', '.js'].includes(extname(entry.name))) {
      let source = await readFile(path, 'utf8');
      for (const [placeholder, value] of replacements) source = source.replaceAll(placeholder, value);
      await writeFile(path, source);
    }
  }
}
await injectPublicConfiguration(out);
console.log(`Built static site at ${relative(root, out)}`);
