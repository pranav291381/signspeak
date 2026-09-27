#!/usr/bin/env node
/**
 * Measures how well a sign pack is recognized, on videos that are not in it
 * (ideally other signers).
 *
 *   npm run eval:signpack -- --pack build/my-signs.signpack --manifest test.json
 *
 * The test manifest has the same form as the builder's ("signs": text + video).
 * Each video is analysed with the app's own tracking and then played, frame by
 * frame at 15 fps, into the same recognition session as Sign → Text. A video
 * whose text is not in the pack checks that unknown signs are not mistaken
 * for known ones. See docs/sign-packs.md.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { createRunner, RunnerError, videoKey } from './lib/signpack-runner.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Recordings sent to the page at once. */
const CHUNK = 40;

const HELP = `Usage: npm run eval:signpack -- --pack <file.signpack> --manifest <test.json> [options]

  --pack <file>       The sign pack to test
  --manifest <file>   Test videos (text + video, as for build:signpack), not used in the pack
  --out <file>        Detailed results (default: <pack>.eval.json)
  --cache <dir>       Videos and per-video results (default: .signpack-cache)
  --browser <name>    chrome, msedge, chromium, or a browser executable path
  --ffmpeg <path>     ffmpeg, for videos the browser cannot play (default: $FFMPEG or ffmpeg)
  --jobs <n>          Videos analysed at once (default 2)
`;

function fail(message) {
  console.error(`eval-sign-pack: ${message}`);
  process.exit(1);
}

const { values: args } = parseArgs({
  options: {
    pack: { type: 'string' },
    manifest: { type: 'string' },
    out: { type: 'string' },
    cache: { type: 'string', default: join(root, '.signpack-cache') },
    browser: { type: 'string' },
    ffmpeg: { type: 'string' },
    jobs: { type: 'string', default: '2' },
    help: { type: 'boolean', short: 'h' },
  },
});
if (args.help) {
  console.log(HELP);
  process.exit(0);
}
if (!args.pack || !args.manifest) fail(`--pack and --manifest are required\n\n${HELP}`);

const readJson = (path, what) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return fail(`cannot read the ${what} ${path}: ${error.message}`);
  }
};
const packPath = resolve(args.pack);
const pack = readJson(packPath, 'pack');
if (pack?.format !== 'islconnect-sign-pack' || !Array.isArray(pack.signs)) fail(`${packPath} is not a sign pack`);
const manifestPath = resolve(args.manifest);
const manifest = readJson(manifestPath, 'manifest');
if (!Array.isArray(manifest?.signs) || manifest.signs.length === 0) fail('the test manifest has no signs');

const idByText = new Map(pack.signs.map((s) => [s.text.trim().toLowerCase(), s.id]));
const textById = new Map(pack.signs.map((s) => [s.id, s.text]));
const entries = manifest.signs.map((sign, i) => {
  if (typeof sign?.text !== 'string' || typeof sign?.video !== 'string') fail(`signs[${i}] needs text and video`);
  const video = /^https?:\/\//.test(sign.video) ? sign.video : resolve(dirname(manifestPath), sign.video);
  return { text: sign.text.trim(), video, key: videoKey(video), label: idByText.get(sign.text.trim().toLowerCase()) ?? null };
});

let runner;
try {
  runner = await createRunner({
    root,
    cacheDir: resolve(args.cache),
    browser: args.browser ?? process.env.SIGNPACK_BROWSER,
    ffmpeg: args.ffmpeg ?? process.env.FFMPEG ?? 'ffmpeg',
    jobs: Math.max(1, Math.min(8, Number(args.jobs) || 1)),
  });
} catch (error) {
  fail(error instanceof RunnerError ? error.message : String(error));
}

const known = entries.filter((e) => e.label).length;
console.log(`Testing ${pack.name} (${pack.signs.length} signs) on ${entries.length} videos (${entries.length - known} of signs not in the pack) with ${runner.browserLabel}…`);
let outcomes;
let results;
try {
  results = await runner.extractAll(entries, {
    raw: true,
    onResult: (entry, r, done) => {
      if (!r.recording) console.log(`  [${done}/${entries.length}] ${entry.text}: could not be analysed (${r.error ?? r.problem})`);
      else if (done % 25 === 0 || done === entries.length) console.log(`  analysed ${done}/${entries.length}`);
    },
  });
  const usable = entries.map((entry, i) => ({ entry, result: results[i] })).filter((x) => x.result.recording);
  outcomes = new Array(entries.length).fill(null);
  for (let start = 0; start < usable.length; start += CHUNK) {
    const chunk = usable.slice(start, start + CHUNK);
    const evaluated = await runner.inPage(
      ([p, cases]) => window.__evaluate(p, cases),
      [pack, chunk.map(({ entry, result }) => ({ label: entry.label, recording: result.recording }))],
    );
    chunk.forEach(({ entry }, k) => {
      outcomes[entries.indexOf(entry)] = evaluated[k];
    });
    console.log(`  played ${Math.min(start + CHUNK, usable.length)}/${usable.length} into the recognizer`);
  }
} finally {
  await runner.close();
}

// ---- Summary ------------------------------------------------------------------

const rows = entries.map((entry, i) => {
  const outcome = outcomes[i];
  const first = outcome?.recognized[0] ?? null;
  const verdict = !outcome ? 'not analysed' : entry.label ? (first === entry.label ? 'correct' : first ? 'wrong' : 'not sure') : first ? 'false alarm' : 'rejected';
  return {
    text: entry.text,
    video: entry.video,
    inPack: Boolean(entry.label),
    verdict,
    shown: (outcome?.recognized ?? []).map((id) => textById.get(id) ?? id),
    ...(outcome?.trueDistance !== undefined ? { trueDistance: outcome.trueDistance } : {}),
    ...(outcome?.bestOther ? { closestOther: { text: textById.get(outcome.bestOther.id), distance: outcome.bestOther.distance } } : {}),
  };
});

const count = (list, verdict) => list.filter((r) => r.verdict === verdict).length;
const pct = (n, d) => (d === 0 ? '–' : `${Math.round((100 * n) / d)}%`);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? null : sorted[Math.floor(sorted.length / 2)];
};
const inPack = rows.filter((r) => r.inPack && r.verdict !== 'not analysed');
const outside = rows.filter((r) => !r.inPack && r.verdict !== 'not analysed');
const trueDistances = inPack.map((r) => r.trueDistance).filter((d) => d !== undefined);
const otherDistances = inPack.map((r) => r.closestOther?.distance).filter((d) => d !== undefined);
const summary = {
  pack: { id: pack.id, name: pack.name, signs: pack.signs.length, defaultThreshold: pack.defaultThreshold },
  videos: entries.length,
  notAnalysed: count(rows, 'not analysed'),
  signsInPack: { videos: inPack.length, correct: count(inPack, 'correct'), wrong: count(inPack, 'wrong'), notSure: count(inPack, 'not sure') },
  signsNotInPack: { videos: outside.length, rejected: count(outside, 'rejected'), falseAlarms: count(outside, 'false alarm') },
  distances: {
    ownSignMedian: median(trueDistances),
    ownSignWithinAcceptance: trueDistances.filter((d) => d <= 1).length,
    closestOtherMedian: median(otherDistances),
    closestOtherWithinAcceptance: otherDistances.filter((d) => d <= 1).length,
  },
};

const outPath = resolve(args.out ?? `${packPath}.eval.json`);
writeFileSync(outPath, `${JSON.stringify({ summary, videos: rows }, null, 2)}\n`);

const s = summary.signsInPack;
console.log(`\nSigns in the pack (${s.videos} videos): ${pct(s.correct, s.videos)} correct, ${pct(s.wrong, s.videos)} wrong, ${pct(s.notSure, s.videos)} "not sure".`);
if (outside.length > 0) {
  const o = summary.signsNotInPack;
  console.log(`Signs not in the pack (${o.videos} videos): ${pct(o.rejected, o.videos)} correctly not shown, ${pct(o.falseAlarms, o.videos)} shown as another sign.`);
}
if (trueDistances.length > 0) {
  const d = summary.distances;
  console.log(
    `Distance to the right sign: median ${d.ownSignMedian} (within acceptance: ${pct(d.ownSignWithinAcceptance, trueDistances.length)}); ` +
      `to the closest wrong sign: median ${d.closestOtherMedian} (within acceptance: ${pct(d.closestOtherWithinAcceptance, otherDistances.length)}).`,
  );
}
if (summary.notAnalysed > 0) console.log(`${summary.notAnalysed} videos could not be analysed.`);
console.log(`Details: ${outPath}`);
