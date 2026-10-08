/**
 * Shared by build-sign-pack.mjs and eval-sign-pack.mjs: serves the extraction
 * page (engine/extract.ts, the app's own hand and body tracking) with the
 * MediaPipe files and the videos to a headless Chrome/Edge/Chromium, and
 * analyses videos there, caching each result.
 */
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

import { build } from 'esbuild';

export const VIDEO_TYPES = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.ogv': 'video/ogg' };
const USER_AGENT = 'SignSpeak-signpack-builder/1 (+https://github.com/pranav291381/signspeak)';

/** A problem the person running the script can fix; printed without a stack trace. */
export class RunnerError extends Error {}

/**
 * Cache key for a video: its URL, or for a local file its path, size and
 * modification time, so a replaced file is analysed again.
 */
export function videoKey(video) {
  const hash = createHash('sha1').update(video);
  if (!/^https?:\/\//.test(video) && existsSync(video)) {
    const { size, mtimeMs } = statSync(video);
    hash.update(`:${size}:${Math.round(mtimeMs)}`);
  }
  return hash.digest('hex').slice(0, 16);
}

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

async function launchBrowser(choice) {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    throw new RunnerError('playwright-core is not installed. Run: npm ci');
  }
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
  throw new RunnerError(`no browser could be started. Install Chrome or Edge, or pass --browser <path>.\n  ${errors.join('\n  ')}`);
}

/**
 * @param {{ root: string, cacheDir: string, browser?: string, ffmpeg?: string, delayMs?: number, jobs?: number }} options
 */
/**
 * `handModel: 'lite'` tracks hands with the lighter model that slow phones switch to,
 * to measure recognition as those phones see it (cached separately).
 */
export async function createRunner({ root, cacheDir, browser: browserChoice, ffmpeg = 'ffmpeg', delayMs = 500, jobs = 2, handModel = 'full' }) {
  if (handModel !== 'full' && handModel !== 'lite') throw new RunnerError(`unknown hand model ${handModel} (full or lite)`);
  const mediapipeDir = join(root, 'public/mediapipe');
  const mediapipeManifest = JSON.parse(readFileSync(join(root, 'src/engine/mediapipeAssets.json'), 'utf8'));
  for (const { file } of Object.values(mediapipeManifest.models)) {
    if (!existsSync(join(mediapipeDir, file))) throw new RunnerError(`public/mediapipe/${file} is missing. Run: npm run setup:mediapipe`);
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
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>SignSpeak sign pack builder</title></head><body><script>${pageScript}</script></body></html>`;
  // Cached results are reused only if they were made by this exact extractor and these models.
  const extractorVersion = createHash('sha1')
    .update(pageScript)
    .update(JSON.stringify(mediapipeManifest.models))
    .update(handModel)
    .digest('hex')
    .slice(0, 12);

  const videoFiles = new Map();
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

  let browser;
  try {
    browser = await launchBrowser(browserChoice);
  } catch (error) {
    server.close();
    throw error;
  }

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

  /**
   * Converts a video the browser cannot play to VP9 WebM: no audio, at most
   * 960 pixels wide (tracking needs no more), and a keyframe every 15 frames
   * so seeking frame by frame stays fast.
   */
  function transcode(path, key) {
    const out = join(videoDir, `${key}.vp9.webm`);
    if (existsSync(out)) return out;
    const result = spawnSync(
      ffmpeg,
      ['-v', 'error', '-y', '-i', path, '-an', '-vf', 'scale=w=min(960\\,iw):h=-2', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '32', '-deadline', 'realtime', '-cpu-used', '8', '-g', '15', `${out}.part.webm`],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    if (result.error) throw new Error(`the browser cannot play this video and ffmpeg is not available (${result.error.code}); pass --ffmpeg or --browser chrome`);
    if (result.status !== 0) throw new Error(`ffmpeg could not convert the video: ${String(result.stderr).trim().split('\n').at(-1)}`);
    renameSync(`${out}.part.webm`, out);
    return out;
  }

  async function extractVideo(pageHandle, entry, raw, depth = false) {
    const cached = join(resultDir, `${entry.key}${raw ? '.raw' : ''}${depth ? '.depth' : ''}${handModel === 'lite' ? '.lite' : ''}.json`);
    if (existsSync(cached)) {
      const result = JSON.parse(readFileSync(cached, 'utf8'));
      if (result.extractorVersion === extractorVersion) return { ...result, cached: true };
    }
    const run = (id) => pageHandle.evaluate(([url, options]) => window.__extract(url, options), [`${origin}/video/${id}`, { raw, depth }]);
    let result;
    try {
      const path = await localVideo(entry);
      videoFiles.set(entry.key, path);
      try {
        result = await run(entry.key);
      } catch (error) {
        if (!/cannot load|video error/.test(String(error.message))) throw error;
        // A new address, so the browser does not reuse what it made of the original.
        videoFiles.set(`${entry.key}-vp9`, transcode(path, entry.key));
        result = await run(`${entry.key}-vp9`);
      }
    } catch (error) {
      result = { ok: false, problem: 'error', error: String(error.message).split('\n')[0] };
    }
    // Failures that may be temporary (downloads, a missing tool) are not cached.
    if (result.problem !== 'error') writeFileSync(cached, JSON.stringify({ ...result, extractorVersion }));
    return result;
  }

  async function openPage() {
    const pageHandle = await browser.newPage();
    pageHandle.on('pageerror', (error) => console.warn(`  page error: ${error.message}`));
    await pageHandle.goto(`${origin}/?hand=${handModel}`);
    await pageHandle.evaluate(() => window.__extractReady);
    return pageHandle;
  }

  return {
    extractorVersion,
    browserLabel: `${browser.browserType().name()} ${browser.version()}`,

    /**
     * Analyses every entry ({ text, video, key }), `jobs` at a time.
     * With `raw`, results also hold every frame of the video (for evaluation).
     */
    async extractAll(entries, { raw = false, depth = false, onResult = () => undefined } = {}) {
      const results = new Array(entries.length);
      let next = 0;
      let done = 0;
      const worker = async () => {
        const pageHandle = await openPage();
        while (next < entries.length) {
          const i = next++;
          results[i] = await extractVideo(pageHandle, entries[i], raw, depth);
          done += 1;
          onResult(entries[i], results[i], done);
        }
        await pageHandle.close();
      };
      await Promise.all(Array.from({ length: Math.min(jobs, entries.length) }, worker));
      return results;
    },

    /** Runs `fn(arg)` in a fresh extraction page (e.g. window.__similar). */
    async inPage(fn, arg) {
      const pageHandle = await openPage();
      try {
        return await pageHandle.evaluate(fn, arg);
      } finally {
        await pageHandle.close();
      }
    },

    async close() {
      await browser.close();
      server.close();
    },
  };
}
