#!/usr/bin/env node
/**
 * Chooses when the app shows a sign for a trained model pack, on held-out
 * recordings, with the app's own recognition session (scripts/lib/tune-model.ts).
 *
 *   npm run tune:model -- --pack build/model/include.signpack --data landmarks.jsonl \
 *     [--split val] [--max-wrong 0.05] [--write] [--also other.signpack]
 *
 * --data is the landmarks file the model was trained from; --split picks the
 * held-out recordings the same way as ml/scripts/train_from_landmarks.py.
 * The chosen setting shows the right sign most often while keeping wrong signs
 * at or below --max-wrong. --write stores it in the pack (and in --also packs,
 * such as the final model trained on every recording).
 *
 * --evaluate measures the pack's own setting instead (e.g. on --split test,
 * after choosing it on validation recordings); --details <file> writes what
 * happened to each recording.
 */
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`tune-model: ${message}`);
  process.exit(1);
}

const { values: args } = parseArgs({
  options: {
    pack: { type: 'string' },
    data: { type: 'string' },
    split: { type: 'string', default: 'val' },
    'max-wrong': { type: 'string', default: '0.05' },
    write: { type: 'boolean', default: false },
    also: { type: 'string', multiple: true, default: [] },
    evaluate: { type: 'boolean', default: false },
    details: { type: 'string' },
  },
});
if (!args.pack || !args.data) fail('--pack and --data are required');
if (!['val', 'test', 'all'].includes(args.split)) fail('--split is val, test or all');
const maxWrong = Number(args['max-wrong']);
if (!(maxWrong >= 0 && maxWrong <= 1)) fail('--max-wrong is a fraction, for example 0.05');

const outDir = join(root, 'node_modules/.cache/islconnect');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'tune-model.mjs');
await build({
  entryPoints: [join(root, 'scripts/lib/tune-model.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: outFile,
  tsconfig: join(root, 'tsconfig.json'),
  logLevel: 'warning',
});
const { tune } = await import(pathToFileURL(outFile).href);

const rows = readFileSync(args.data, 'utf8')
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));
let result;
try {
  const packJson = JSON.parse(readFileSync(args.pack, 'utf8'));
  if (args.evaluate && !packJson.stabilizer) fail('--evaluate needs a pack with settings (tune it on validation recordings first)');
  result = await tune({
    pack: packJson,
    fixed: args.evaluate ? packJson.stabilizer : undefined,
    rows,
    split: args.split,
    maxWrong,
    nextTask: () => new Promise((resolve) => setImmediate(resolve)),
    progress: (done, total) => {
      if (done % 100 === 0 || done === total) console.error(`  predicted ${done}/${total} recordings`);
    },
  });
} catch (error) {
  fail(error.message);
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const line = (o) =>
  `confidence ${o.minConfidence}, margin ${o.minMargin}, ${o.minStablePredictions} in a row: ${pct(o.correct)} right, ${pct(o.wrong)} wrong, ${pct(o.notSure)} not sure` +
  (o.correctOrSuggested > o.correct ? ` (right or among the suggestions: ${pct(o.correctOrSuggested)})` : '');
console.log(`${result.recordings} ${args.split} recordings of ${result.signs} signs`);
if (result.defaults) console.log(`app defaults: ${line(result.defaults)}`);
if (!result.chosen) {
  console.log(`no setting keeps wrong signs at or below ${pct(maxWrong)}`);
  process.exit(2);
}
console.log(args.evaluate ? `the pack's settings: ${line(result.chosen)}` : `chosen (wrong at most ${pct(maxWrong)}): ${line(result.chosen)}`);
if (args.details) {
  writeFileSync(args.details, JSON.stringify(result.details, null, 1));
  console.log(`wrote per-recording results to ${args.details}`);
}
if (args.write) {
  const { minConfidence, minMargin, minStablePredictions, correct, wrong, notSure } = result.chosen;
  for (const path of [args.pack, ...args.also]) {
    const pack = JSON.parse(readFileSync(path, 'utf8'));
    pack.stabilizer = { minConfidence, minMargin, minStablePredictions };
    pack.evaluation = {
      ...(pack.evaluation ?? {}),
      stabilizer_tuning: { split: args.split, recordings: result.recordings, max_wrong: maxWrong, right: correct, wrong, not_sure: notSure },
    };
    writeFileSync(path, JSON.stringify(pack));
    console.log(`wrote the settings into ${path}`);
  }
}
