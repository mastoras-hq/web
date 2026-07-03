import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'dist');
const types = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
};
const headerRules = [];
let currentHeaderRule = null;
for (const line of readFileSync(join(root, '_headers'), 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  if (!/^\s/.test(line)) {
    currentHeaderRule = { pattern: trimmed, headers: {} };
    headerRules.push(currentHeaderRule);
    continue;
  }
  if (!currentHeaderRule) throw new Error(`Header without a path rule: ${trimmed}`);
  const separator = trimmed.indexOf(':');
  if (separator < 1) throw new Error(`Invalid header rule: ${trimmed}`);
  currentHeaderRule.headers[trimmed.slice(0, separator)] = trimmed.slice(separator + 1).trim();
}

function responseHeaders(urlPath) {
  const headers = {};
  for (const rule of headerRules) {
    const matches = rule.pattern.endsWith('*')
      ? urlPath.startsWith(rule.pattern.slice(0, -1))
      : urlPath === rule.pattern;
    if (matches) Object.assign(headers, rule.headers);
  }
  return headers;
}

const server = createServer((request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  let file = normalize(join(root, urlPath));
  if (!file.startsWith(root)) {
    response.writeHead(400).end('Bad request');
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, {
    ...responseHeaders(urlPath),
    'Content-Type': types[extname(file)] || 'application/octet-stream',
  });
  createReadStream(file).pipe(response);
}).listen(4173, '127.0.0.1');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
