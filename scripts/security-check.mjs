import { readFile } from 'node:fs/promises';

for (const path of ['advisor/index.html', 'hq/index.html']) {
  const source = await readFile(path, 'utf8');
  for (const forbidden of ['localStorage.setItem', 'api-key-modal', 'X-API-Key', 'web3forms.com']) {
    if (source.includes(forbidden)) throw new Error(`${path} still contains ${forbidden}`);
  }
}

const hqSource = await readFile('hq/index.html', 'utf8');
if (/\son(?:click|change|input|blur|submit)\s*=/i.test(hqSource)) {
  throw new Error('hq/index.html still contains an inline event handler');
}
