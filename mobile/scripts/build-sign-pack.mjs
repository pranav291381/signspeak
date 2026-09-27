#!/usr/bin/env node
/**
 * Builds a sign pack from sign videos (e.g. a sign language dictionary).
 *
 *   npm run build:signpack -- --manifest dictionary.json --out build/isl-dictionary.signpack
 *
 * Every video is analysed with exactly the hand and body tracking the app uses
 * (engine/extract.ts, run in Chrome/Edge/Chromium), reduced to landmark numbers,
 * and written into one pack file. Videos are downloaded to a local cache and
 * never leave this computer; the pack holds no images or video.
 *
 * Re-running continues where it stopped: finished videos are cached.
 * See docs/sign-packs.md for the manifest format and all options.
 */
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FORMAT = 'islconnect-sign-pack';
const FEATURE_SPEC_VERSION = 1;
const SAMPLE_FPS = 15;
const DEFAULT_THRESHOLD = 0.9;
const LANGUAGES = ['en', 'hi', 'bn', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa'];
const VIDEO_TYPES = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.ogv': 'video/ogg' };
const USER_AGENT = 'ISLConnect-signpack-builder/1 (+https://github.com/pranav291381/signspeak)';

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
    key: createHash('sha1').update(video).digest('hex').slice(0, 16),
    category: sign.category,
    sourceUrl: sign.sourceUrl,
    letter: sign.letter === true,
  };
});
const threshold = Number(args.threshold);
if (!(threshold > 0.05 && threshold < 5)) fail('--threshold must be between 0.05 and 5');
const jobs = Math.max(1, Math.min(8, Number(args.jobs) || 1));
const delayMs = Math.max(0, Number(args['delay-ms']) || 0);

// ---- Extraction page ----------------------------------------------------------

const mediapipeDir = join(root, 'public/mediapipe');
const mediapipeManifest = JSON.parse(readFileSync(join(root, 'src/engine/mediapipeAssets.json'), 'utf8'));
for (const { file } of Object.values(mediapipeManifest.models)) {
  if (!existsSync(join(mediapipeDir, file))) fail(`public/mediapipe/${file} is missing. Run: npm run setup:mediapipe`);
}

const bundle = await build({
  entryPoints: [join(root, 'engine/extract.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
});
const pageScript = bundle.outputFiles[0].text;
const page = `<!doctype html><html><head><meta charset="utf-8"><title>ISL Connect sign pack builder</title></head><body><script>${pageScript}</script></body></html>`;
// Cached results are reused only if they were made by this exact extractor and these models.
const extractorVersion = createHash('sha1')
  .update(pageScript)
  .update(JSON.stringify(mediapipeManifest.models))
  .digest('hex')
  .slice(0, 12);

// ---- Local server: the page, MediaPipe files and videos (with byte ranges, for seeking) ----

const videoFiles = new Map();

function serveFile(request, response, path, type) {
  const size = statSync(path).size;
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.range ?? '');
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      return;
    }
    response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    createReadStream(path, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, { ...headers, 'Content-Length': size });
  createReadStream(path).pipe(response);
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page);
    return;
  }
  if (url.pathname.startsWith('/mediapipe/')) {
    const relative = url.pathname.slice('/mediapipe/'.length);
    const path = join(mediapipeDir, relative);
    if (relative.includes('..') || !existsSync(path)) {
      response.writeHead(404).end();
      return;
    }
    const type = path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
    serveFile(request, response, path, type);
    return;
  }
  const video = /^\/video\/([0-9a-f]+(?:-vp9)?)$/.exec(url.pathname);
  const path = video && videoFiles.get(video[1]);
  if (path) {
    serveFile(request, response, path, VIDEO_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream');
    return;
  }
  response.writeHead(404).end();
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;

// ---- Browser ----------------------------------------------------------------

async function launchBrowser() {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    fail('playwright-core is not installed. Run: npm ci');
  }
  const choice = args.browser ?? process.env.SIGNPACK_BROWSER;
  const attempts =
    choice === 'chrome' || choice === 'msedge'
      ? [{ channel: choice }]
      : choice === 'chromium'
        ? [{}]
        : choice
          ? [{ executablePath: choice }]
          : [{ channel: 'chrome' }, { channel: 'msedge' }, {}];
  const errors = [];
  for (const options of attempts) {
    try {
      return await chromium.launch({ headless: true, ...options });
    } catch (error) {
      errors.push(`${options.channel ?? options.executablePath ?? 'chromium'}: ${String(error.message).split('\n')[0]}`);
    }
  }
  fail(`no browser could be started. Install Chrome or Edge, or pass --browser <path>.\n  ${errors.join('\n  ')}`);
}

// ---- Videos -----------------------------------------------------------------

const cacheDir = resolve(args.cache);
const videoDir = join(cacheDir, 'videos');
const resultDir = join(cacheDir, 'results');
mkdirSync(videoDir, { recursive: true });
mkdirSync(resultDir, { recursive: true });

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
let lastDownload = 0;

async function localVideo(entry) {
  if (!/^https?:\/\//.test(entry.video)) {
    if (!existsSync(entry.video)) throw new Error(`video not found: ${entry.video}`);
    return entry.video;
  }
  const ext = (extname(new URL(entry.video).pathname).toLowerCase() || '.mp4').slice(0, 6);
  const path = join(videoDir, entry.key + ext);
  if (existsSync(path)) return path;
  // Downloads are spaced out, whatever the number of jobs.
  const wait = lastDownload + delayMs - Date.now();
  lastDownload = Math.max(Date.now(), lastDownload + delayMs);
  if (wait > 0) await sleep(wait);
  const response = await fetch(entry.video, { headers: { 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`download failed: HTTP ${response.status}`);
  writeFileSync(`${path}.part`, Buffer.from(await response.arrayBuffer()));
  renameSync(`${path}.part`, path);
  return path;
}

const ffmpeg = args.ffmpeg ?? process.env.FFMPEG ?? 'ffmpeg';

/** Converts a video the browser cannot play to VP9 WebM (no audio). */
function transcode(path, key) {
  const out = join(videoDir, `${key}.vp9.webm`);
  if (existsSync(out)) return out;
  const result = spawnSync(
    ffmpeg,
    ['-v', 'error', '-y', '-i', path, '-an', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '30', '-deadline', 'realtime', '-cpu-used', '8', `${out}.part.webm`],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  if (result.error) throw new Error(`the browser cannot play this video and ffmpeg is not available (${result.error.code}); pass --ffmpeg or --browser chrome`);
  if (result.status !== 0) throw new Error(`ffmpeg could not convert the video: ${String(result.stderr).trim().split('\n').at(-1)}`);
  renameSync(`${out}.part.webm`, out);
  return out;
}

async function extractVideo(pageHandle, entry) {
  const cached = join(resultDir, `${entry.key}.json`);
  if (existsSync(cached)) {
    const result = JSON.parse(readFileSync(cached, 'utf8'));
    if (result.extractorVersion === extractorVersion) return { ...result, cached: true };
  }
  let result;
  try {
    const path = await localVideo(entry);
    videoFiles.set(entry.key, path);
    try {
      result = await pageHandle.evaluate((url) => window.__extract(url), `${origin}/video/${entry.key}`);
    } catch (error) {
      if (!/cannot load|video error/.test(String(error.message))) throw error;
      // A new address, so the browser does not reuse what it made of the original.
      videoFiles.set(`${entry.key}-vp9`, transcode(path, entry.key));
      result = await pageHandle.evaluate((url) => window.__extract(url), `${origin}/video/${entry.key}-vp9`);
    }
  } catch (error) {
    result = { ok: false, problem: 'error', error: String(error.message).split('\n')[0] };
  }
  // Failures that may be temporary (downloads, a missing tool) are not cached.
  if (result.problem !== 'error') writeFileSync(cached, JSON.stringify({ ...result, extractorVersion }));
  return result;
}

// ---- Run ----------------------------------------------------------------------

const browser = await launchBrowser();
console.log(`Analysing ${entries.length} videos with ${browser.browserType().name()} ${browser.version()} (${jobs} at a time)…`);
const results = new Array(entries.length);
let next = 0;
let done = 0;
const started = Date.now();

async function worker() {
  const pageHandle = await browser.newPage();
  pageHandle.on('pageerror', (error) => console.warn(`  page error: ${error.message}`));
  await pageHandle.goto(origin);
  await pageHandle.evaluate(() => window.__extractReady);
  while (next < entries.length) {
    const i = next++;
    results[i] = await extractVideo(pageHandle, entries[i]);
    done += 1;
    const r = results[i];
    const status = r.ok ? `${r.sample.frames} frames` : `skipped (${r.error ?? r.problem})`;
    console.log(`  [${done}/${entries.length}] ${entries[i].text}: ${status}${r.cached ? ' (cached)' : ''}`);
  }
  await pageHandle.close();
}

let similar = [];
let pack;
try {
  await Promise.all(Array.from({ length: Math.min(jobs, entries.length) }, worker));

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

  if (pack.signs.length > 1) {
    const analysis = await browser.newPage();
    await analysis.goto(origin);
    await analysis.evaluate(() => window.__extractReady);
    similar = await analysis.evaluate(([p]) => window.__similar(p, 3), [pack]);
  }
} finally {
  await browser.close();
  server.close();
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
