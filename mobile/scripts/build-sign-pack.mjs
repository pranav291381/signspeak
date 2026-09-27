#!/usr/bin/env node
/**
 * Builds a sign pack from sign videos you have the right to use.
 *
 *   npm run build:signpack -- --manifest vocabulary.json --out build/my-signs.signpack
 *
 * Every video is analysed with exactly the hand and body tracking the app uses
 * (engine/extract.ts, run in Chrome/Edge/Chromium), reduced to landmark numbers,
 * and written into one pack file. Videos are downloaded to a local cache and
 * never leave this computer; the pack holds no images or video.
 *
 * Re-running continues where it stopped: finished videos are cached.
 * See docs/sign-packs.md for the manifest format and all options.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { createRunner, RunnerError, videoKey } from './lib/signpack-runner.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORMAT = 'islconnect-sign-pack';
const FEATURE_SPEC_VERSION = 1;
const SAMPLE_FPS = 15;
const DEFAULT_THRESHOLD = 0.9;
const LANGUAGES = ['en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa'];

const HELP = `Usage: npm run build:signpack -- --manifest <file.json> --out <file.signpack> [options]

  --manifest <file>   Signs to include (see docs/sign-packs.md)
  --out <file>        Pack to write; a report is written next to it (<out>.report.json)
  --cache <dir>       Downloaded videos and per-video results (default: .signpack-cache)
  --browser <name>    chrome, msedge, chromium, or a browser executable path
                      (default: chrome, then msedge, then Playwright's Chromium)
  --ffmpeg <path>     ffmpeg, to convert videos the browser cannot play (default: $FFMPEG or ffmpeg)
  --jobs <n>          Videos analysed at once (default 2)
  --delay-ms <n>      Pause between downloads, to be gentle with the source (default 500)
  --limit <n>         Only the first n signs (for a trial run)
  --threshold <d>     Acceptance distance for the pack's signs (default ${DEFAULT_THRESHOLD}, not yet calibrated)
`;

function fail(message) {
  console.error(`build-sign-pack: ${message}`);
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
    'delay-ms': { type: 'string', default: '500' },
    limit: { type: 'string' },
    threshold: { type: 'string', default: String(DEFAULT_THRESHOLD) },
    help: { type: 'boolean', short: 'h' },
  },
});
if (args.help) {
  console.log(HELP);
  process.exit(0);
}
if (!args.manifest || !args.out) fail(`--manifest and --out are required\n\n${HELP}`);

// ---- Manifest ---------------------------------------------------------------

/** URL-safe id part: "Good morning!" → "good-morning". Non-Latin words keep their letters. */
function slugify(text) {
  const slug = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'sign';
}

function readManifest(path) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`cannot read the manifest ${path}: ${error.message}`);
  }
  const problems = [];
  const text = (value) => typeof value === 'string' && value.trim().length > 0;
  if (!text(manifest.id) || !/^[a-z0-9-]+$/.test(manifest.id)) problems.push('id (lowercase letters, digits and -)');
  if (!text(manifest.name)) problems.push('name');
  const source = manifest.source ?? {};
  if (!text(source.name) || !text(source.url) || !text(source.permission)) problems.push('source.name, source.url and source.permission');
  const language = manifest.language ?? 'en';
  if (!LANGUAGES.includes(language)) problems.push(`language (one of ${LANGUAGES.join(', ')})`);
  if (!Array.isArray(manifest.signs) || manifest.signs.length === 0) problems.push('signs (a non-empty list)');
  (manifest.signs ?? []).forEach((sign, i) => {
    if (!text(sign?.text) || !text(sign?.video)) problems.push(`signs[${i}] needs text and video`);
  });
  if (problems.length > 0) fail(`the manifest is missing or has an invalid ${problems.join('; ')}`);
  return { ...manifest, language };
}

const manifestPath = resolve(args.manifest);
const manifest = readManifest(manifestPath);
const limit = args.limit ? Number(args.limit) : Infinity;
const entries = manifest.signs.slice(0, limit).map((sign) => {
  const video = /^https?:\/\//.test(sign.video) ? sign.video : resolve(dirname(manifestPath), sign.video);
  return {
    text: sign.text.trim(),
    video,
    key: videoKey(video),
    category: sign.category,
    sourceUrl: sign.sourceUrl,
    letter: sign.letter === true,
  };
});
const threshold = Number(args.threshold);
if (!(threshold > 0.05 && threshold < 5)) fail('--threshold must be between 0.05 and 5');
const jobs = Math.max(1, Math.min(8, Number(args.jobs) || 1));
const delayMs = Math.max(0, Number(args['delay-ms']) || 0);

// ---- Analyse the videos ----------------------------------------------------------

let runner;
try {
  runner = await createRunner({
    root,
    cacheDir: resolve(args.cache),
    browser: args.browser ?? process.env.SIGNPACK_BROWSER,
    ffmpeg: args.ffmpeg ?? process.env.FFMPEG ?? 'ffmpeg',
    delayMs,
    jobs,
  });
} catch (error) {
  fail(error instanceof RunnerError ? error.message : String(error));
}
const { extractorVersion } = runner;
console.log(`Analysing ${entries.length} videos with ${runner.browserLabel} (${jobs} at a time)…`);
const started = Date.now();
let results;

let similar = [];
let pack;
try {
  results = await runner.extractAll(entries, {
    onResult: (entry, r, done) => {
      const status = r.ok ? `${r.sample.frames} frames` : `skipped (${r.error ?? r.problem})`;
      console.log(`  [${done}/${entries.length}] ${entry.text}: ${status}${r.cached ? ' (cached)' : ''}`);
    },
  });

  // Videos with the same text become recordings of one sign (e.g. variants).
  const signs = new Map();
  const slugs = new Set();
  entries.forEach((entry, i) => {
    const result = results[i];
    if (!result.ok) return;
    const key = entry.text.toLowerCase();
    let sign = signs.get(key);
    if (!sign) {
      let slug = slugify(entry.text);
      for (let n = 2; slugs.has(slug); n++) slug = `${slugify(entry.text)}-${n}`;
      slugs.add(slug);
      sign = {
        id: `${manifest.id}:${slug}`,
        text: entry.text,
        language: manifest.language,
        ...(entry.category ? { category: String(entry.category) } : {}),
        ...(entry.sourceUrl ? { sourceUrl: String(entry.sourceUrl) } : {}),
        ...(entry.letter ? { letter: true } : {}),
        samples: [],
      };
      signs.set(key, sign);
    }
    sign.samples.push(result.sample);
  });

  pack = {
    format: FORMAT,
    version: 1,
    id: manifest.id,
    name: manifest.name,
    featureSpecVersion: FEATURE_SPEC_VERSION,
    sampleFps: SAMPLE_FPS,
    source: { name: manifest.source.name, url: manifest.source.url, permission: manifest.source.permission },
    createdAt: new Date().toISOString(),
    defaultThreshold: threshold,
    signs: [...signs.values()],
  };

  if (pack.signs.length > 1) similar = await runner.inPage(([p]) => window.__similar(p, 3), [pack]);
} finally {
  await runner.close();
}

if (pack.signs.length === 0) fail('no video could be used, so no pack was written. The messages above say why.');
const outPath = resolve(args.out);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(pack));

const byId = new Map(similar.map((s) => [s.id, s.nearest]));
const report = {
  pack: { id: pack.id, name: pack.name, signs: pack.signs.length, bytes: statSync(outPath).size, createdAt: pack.createdAt },
  extractorVersion,
  videos: entries.map((entry, i) => {
    const r = results[i];
    const sign = pack.signs.find((s) => s.text.toLowerCase() === entry.text.toLowerCase());
    return {
      text: entry.text,
      video: entry.video,
      ok: r.ok,
      ...(r.ok ? {} : { problem: r.error ?? r.problem }),
      frames: r.frames,
      withPerson: r.withPerson,
      withHands: r.withHands,
      withRaisedHands: r.withRaisedHands,
      ...(r.width ? { size: `${r.width}x${r.height}` } : {}),
      ...(r.ok && sign ? { id: sign.id, similar: byId.get(sign.id) ?? [] } : {}),
    };
  }),
};
const reportPath = `${outPath}.report.json`;
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const failed = report.videos.filter((v) => !v.ok);
const confusable = similar.filter((s) => s.nearest[0] && s.nearest[0].distance <= 1);
console.log(`\nWrote ${outPath}: ${pack.signs.length} signs, ${Math.round(report.pack.bytes / 1024)} KB, in ${Math.round((Date.now() - started) / 1000)} s.`);
if (failed.length > 0) console.log(`${failed.length} videos were left out (see the report for why).`);
if (confusable.length > 0) console.log(`${confusable.length} signs look alike to the recognizer; the report lists the closest pairs.`);
console.log(`Report: ${reportPath}`);
console.log(`Install it in the app with: npm run install:signpack -- ${isAbsolute(args.out) ? outPath : args.out}`);
