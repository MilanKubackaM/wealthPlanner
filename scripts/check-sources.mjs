#!/usr/bin/env node
/**
 * Requests every source URL the site shows on /parametre and reports the ones that are dead.
 *
 * This exists because the links rotted silently. A wrong number is at least visible; a source
 * link that 404s is worse than no link, because it is the page's own claim that the figure was
 * checked. Nothing in the type system can catch that, so this asks the internet.
 *
 * Needs network, so it is NOT part of `pnpm check` or CI — run it by hand (`pnpm sources:check`)
 * whenever a constant is touched, and read the output. Run it from a normal network: behind an
 * egress proxy every host answers 403 and the run tells you nothing, which the summary says.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'packages/jurisdictions/src/cz.ts',
  'packages/jurisdictions/src/sk.ts',
  'apps/web/src/lib/defaults.ts',
];

/** Only string literals, so a URL inside a prose comment is not mistaken for a source. */
const urls = new Map();
for (const rel of FILES) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  for (const line of src.split('\n')) {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    for (const [, url] of line.matchAll(/'(https?:\/\/[^']+)'/g)) {
      if (!urls.has(url)) urls.set(url, rel);
    }
  }
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

/** HEAD first: cheaper, and most of these are large pages. Some hosts only answer GET. */
async function probe(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        headers: { 'user-agent': UA, accept: 'text/html,*/*' },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status !== 405 && res.status !== 501) {
        return { status: res.status, final: res.url };
      }
    } catch (err) {
      if (method === 'GET') return { status: 0, error: err.message };
    }
  }
  return { status: 0, error: 'no response' };
}

const results = await Promise.all(
  [...urls].map(async ([url, file]) => ({ url, file, ...(await probe(url)) })),
);

let dead = 0;
for (const r of results.sort((a, b) => a.url.localeCompare(b.url))) {
  const ok = r.status >= 200 && r.status < 400;
  // 403 is a bot block, not a dead link. Reported, but not a failure.
  const blocked = r.status === 401 || r.status === 403 || r.status === 429;
  const mark = ok ? 'ok  ' : blocked ? 'bot ' : 'DEAD';
  if (!ok && !blocked) dead += 1;
  const moved = ok && r.final && r.final !== r.url ? `\n       -> ${r.final}` : '';
  console.log(`${mark} ${String(r.status).padStart(3)}  ${r.url}${moved}`);
}

const blockedCount = results.filter((r) => [401, 403, 429].includes(r.status)).length;
console.log(`\n${urls.size} sources, ${dead} dead, ${blockedCount} bot-blocked.`);
if (blockedCount === urls.size) {
  console.log(
    'Every single host answered 403 — that is an egress proxy in front of this shell, not\n' +
      'twenty-one broken links. Re-run from an unproxied network before believing the result.',
  );
}
if (dead > 0) {
  console.error('check-sources: fix or replace the DEAD links above, then re-run.');
  process.exit(1);
}
