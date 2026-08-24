#!/usr/bin/env node
/**
 * Guards the rule that any change to the engine's arithmetic must bump ENGINE_VERSION.
 *
 * Saved scenarios store the engine version they were computed with. If a formula changes
 * without a version bump, every stored scenario silently starts meaning something else —
 * the sharpest correctness risk in the whole system. This check makes that impossible to
 * do by accident.
 *
 * Run `node scripts/engine-version-guard.mjs --accept` after a deliberate change.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = join(ROOT, 'packages/engine/src');
const JURIS = join(ROOT, 'packages/jurisdictions/src');
const FINGERPRINT = join(ROOT, 'packages/engine/.engine-fingerprint');

/** Files whose contents change what a projection MEANS. */
const WATCHED = [
  join(ENGINE, 'simulate.ts'),
  join(ENGINE, 'problems.ts'),
  join(ENGINE, 'recommend.ts'),
  join(ENGINE, 'time.ts'),
  join(JURIS, 'cz.ts'),
  join(JURIS, 'sk.ts'),
];

const hash = createHash('sha256');
for (const file of WATCHED) hash.update(readFileSync(file));
const digest = hash.digest('hex').slice(0, 16);

const versionSrc = readFileSync(join(ENGINE, 'version.ts'), 'utf8');
const match = /ENGINE_VERSION\s*=\s*(\d+)/.exec(versionSrc);
if (!match) {
  console.error('engine-version-guard: could not read ENGINE_VERSION');
  process.exit(2);
}
const version = Number(match[1]);
const line = `${version} ${digest}\n`;

if (process.argv.includes('--accept') || !existsSync(FINGERPRINT)) {
  writeFileSync(FINGERPRINT, line, 'utf8');
  console.log(`engine-version-guard: recorded v${version} ${digest}`);
  process.exit(0);
}

const [recordedVersion, recordedDigest] = readFileSync(FINGERPRINT, 'utf8').trim().split(/\s+/);
if (recordedDigest === digest) {
  console.log(`engine-version-guard: unchanged (v${version} ${digest})`);
  process.exit(0);
}
if (Number(recordedVersion) < version) {
  writeFileSync(FINGERPRINT, line, 'utf8');
  console.log(`engine-version-guard: engine changed and version bumped to v${version} — OK`);
  process.exit(0);
}
console.error(
  `engine-version-guard: FAIL\n` +
    `  Engine arithmetic changed (${recordedDigest} -> ${digest}) but ENGINE_VERSION is still ${version}.\n` +
    `  Bump ENGINE_VERSION in packages/engine/src/version.ts, or run with --accept if this was\n` +
    `  a pure refactor with no change to any produced number (and say so in the PR).`,
);
process.exit(1);
