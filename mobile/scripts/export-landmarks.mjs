#!/usr/bin/env node
/**
 * Exports landmark recordings of sign videos, for training a model
 * (ml/scripts/train_from_landmarks.py).
 *
 *   npm run export:landmarks -- --manifest videos.json --out landmarks.jsonl
 *
 * The manifest is like the sign pack builder's ("signs": text + video), with an
 * optional "group" per video: who signed it or in which session, so a model can
 * be tested on groups it was not trained on. Each video is analysed with the
 * app's own tracking; one JSON line per video holds every frame (without
 * depth), never images. Results are cached, so re-runs continue.
 */
import { createWriteStream, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { createRunner, RunnerError, videoKey } from './lib/signpack-runner.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`export-landmarks: ${message}`);
  process.exit(1);
}

const { values: args } = parseArgs({
  options: {
    manifest: { type: 'string' },
    out: { type: 'string' },
    cache: { type: 'string', default: join(root, '.signpack-cache') },
    browser: { type: 'string' },
    ffmpeg: { type: 'string' },
    jobs: { type: 'string', default: '2' },
    'hand-model': { type: 'string', default: 'full' },
    depth: { type: 'boolean', default: false },
  },
});
if (!args.manifest || !args.out) fail('--manifest and --out are required');

const manifestPath = resolve(args.manifest);
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail(`cannot read ${manifestPath}: ${error.message}`);
}
if (!Array.isArray(manifest?.signs) || manifest.signs.length === 0) fail('the manifest has no signs');
const entries = manifest.signs.map((sign, i) => {
  if (typeof sign?.text !== 'string' || typeof sign?.video !== 'string') fail(`signs[${i}] needs text and video`);
  const video = /^https?:\/\//.test(sign.video) ? sign.video : resolve(dirname(manifestPath), sign.video);
  return { text: sign.text.trim(), video, key: videoKey(video), group: sign.group ?? null, category: sign.category ?? null };
});

let runner;
try {
  runner = await createRunner({
    root,
    cacheDir: resolve(args.cache),
    browser: args.browser ?? process.env.SIGNPACK_BROWSER,
    ffmpeg: args.ffmpeg ?? process.env.FFMPEG ?? 'ffmpeg',
    jobs: Math.max(1, Math.min(8, Number(args.jobs) || 1)),
    handModel: args['hand-model'],
  });
} catch (error) {
  fail(error instanceof RunnerError ? error.message : String(error));
}

console.log(`Exporting ${entries.length} videos with ${runner.browserLabel}…`);
const out = createWriteStream(resolve(args.out));
let written = 0;
const started = Date.now();
try {
  await runner.extractAll(entries, {
    raw: true,
    depth: args.depth,
    onResult: (entry, result, done) => {
      if (result.recording) {
        out.write(`${JSON.stringify({ text: entry.text, group: entry.group, category: entry.category, recording: result.recording })}\n`);
        written += 1;
      } else {
        console.log(`  ${entry.text}: could not be analysed (${result.error ?? result.problem})`);
      }
      if (done % 50 === 0 || done === entries.length) {
        const rate = done / ((Date.now() - started) / 1000);
        console.log(`  ${done}/${entries.length} (${rate.toFixed(1)} videos/s)`);
      }
    },
  });
} finally {
  await runner.close();
  await new Promise((ok) => out.end(ok));
}
console.log(`Wrote ${written} recordings to ${resolve(args.out)}.`);
