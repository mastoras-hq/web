import { readFile } from 'node:fs/promises';

for (const path of ['advisor/index.html', 'hq/index.html']) {
  const source = await readFile(path, 'utf8');
  for (const forbidden of ['localStorage.setItem', 'api-key-modal', 'X-API-Key', 'web3forms.com']) {
    if (source.includes(forbidden)) throw new Error(`${path} still contains ${forbidden}`);
  }
}

for (const path of ['advisor/index.html', 'hq/index.html']) {
  const source = await readFile(path, 'utf8');
  if (/\son[a-z]+\s*=/i.test(source)) {
    throw new Error(`${path} still contains an inline event handler`);
  }
}

for (const path of [
  'login/index.html',
  'auth/callback/index.html',
  'advisor/index.html',
  'hq/index.html',
  'funding-check/index.html',
  'readiness-check/form/index.html',
]) {
  const source = await readFile(path, 'utf8');
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(source)) {
    throw new Error(`${path} still contains an inline executable script`);
  }
}

{
  const firstPartyPublicScripts = new Map([
    ['funding-check/index.html', '/assets/js/funding-check.js'],
    ['readiness-check/form/index.html', '/assets/js/brick-form.js'],
  ]);
  for (const [path, script] of firstPartyPublicScripts) {
    const source = await readFile(path, 'utf8');
    if (/\son[a-z]+\s*=/i.test(source)) {
      throw new Error(`${path} still contains an inline event handler`);
    }
    if (!source.includes(script)) {
      throw new Error(`${path} does not load ${script}`);
    }
  }
}

const publicNavigationPages = [
  'index.html',
  'privacy-policy.html',
  'tools/index.html',
  'readiness-check/index.html',
  'blog/index.html',
  'blog/five-questions-every-new-client.html',
  'blog/grant-writing-northern-ireland.html',
  'blog/pre-build-assessment-case-study.html',
  'blog/structure-story-soul.html',
  'blog/why-tradespeople-undercharge.html',
  'blog/wrong-grant-northern-ireland.html',
];

for (const path of publicNavigationPages) {
  const source = await readFile(path, 'utf8');
  if (/\son[a-z]+\s*=/i.test(source)) {
    throw new Error(`${path} still contains an inline event handler`);
  }
  if (!source.includes('/assets/js/public-ui.js')) {
    throw new Error(`${path} does not load the shared public UI module`);
  }
}
