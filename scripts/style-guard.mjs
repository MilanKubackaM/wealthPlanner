#!/usr/bin/env node
/**
 * Two ratchets, so a design system does not decay back into a one-off refactor.
 *
 * The refactor that introduced the token scale left 163 inline-style sites and 117 hardcoded
 * numeric literals behind on purpose — retiring them by CATEGORY, in reviewable commits, is
 * the plan, and a big-bang rewrite of 18 files is how a design system gets reverted. What
 * matters is that the number only ever goes DOWN. This script fails when it goes up, and
 * tells you to lower the baseline when it drops.
 *
 * ReserveChart.tsx is excluded from the numeric check and always will be: its 10/11/12 font
 * sizes are viewBox units, not pixels, and "migrating" them to the type scale would silently
 * resize every label in the chart.
 *
 *   node scripts/style-guard.mjs
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'apps/web/src');

/* Lower these when a category is retired. Never raise them. */
const BASELINE = {
  inlineStyles: 134,
  numericLiterals: 94,
};

const NUMERIC = /(fontSize: [0-9]|borderRadius: [0-9]|gap: [0-9])/;
const EXCLUDE_NUMERIC = ['ReserveChart.tsx'];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

let inlineStyles = 0;
let numericLiterals = 0;
const worst = new Map();

for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  const inline = (text.match(/style=\{\{/g) ?? []).length;
  inlineStyles += inline;
  if (inline > 0) worst.set(relative(ROOT, file), inline);
  if (!EXCLUDE_NUMERIC.some((name) => file.endsWith(name))) {
    for (const line of text.split('\n')) if (NUMERIC.test(line)) numericLiterals++;
  }
}

let failed = false;
for (const [key, limit] of Object.entries(BASELINE)) {
  const actual = key === 'inlineStyles' ? inlineStyles : numericLiterals;
  if (actual > limit) {
    console.error(`style-guard: ${key} rose from ${limit} to ${actual}. Use a token or a class.`);
    failed = true;
  } else if (actual < limit) {
    console.log(`style-guard: ${key} is down to ${actual} (baseline ${limit}) — lower the baseline.`);
  } else {
    console.log(`style-guard: ${key} holding at ${actual}.`);
  }
}

if (failed) {
  const top = [...worst.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.error('\nHeaviest files:');
  for (const [file, count] of top) console.error(`  ${count}\t${file}`);
  process.exit(1);
}
