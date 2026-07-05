import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const excludedDirectories = new Set(['.git', 'dist', 'node_modules', 'scripts']);
const publicExtensions = new Set(['.html', '.js']);
const probabilityClaims = [
  /scored?\s+(?:view of\s+)?(?:your\s+)?chances/i,
  /chance(?:s)?\s+of\s+(?:success|award|funding)/i,
  /probability\s+of\s+(?:success|award|funding)/i,
  /likelihood\s+of\s+(?:success|award|funding)/i,
  /likely\s+to\s+(?:win|succeed|qualify|be funded)/i,
  /odds\s+of\s+(?:success|award|funding)/i,
];

async function checkDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;

    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await checkDirectory(path);
      continue;
    }
    if (!publicExtensions.has(extname(entry.name))) continue;

    const source = await readFile(path, 'utf8');
    for (const claim of probabilityClaims) {
      if (claim.test(source)) {
        throw new Error(
          `${relative(root, path)} implies an award probability; use funding fit language`,
        );
      }
    }
  }
}

await checkDirectory(root);
