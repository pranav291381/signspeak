#!/usr/bin/env node
/**
 * Places MediaPipe files in public/mediapipe/ so the web build serves them
 * from its own origin (offline-capable, no third-party requests):
 *   - WASM loader/binary copied from node_modules/@mediapipe/tasks-vision
 *   - hand + pose models downloaded from Google's model storage
 * Every file is checked against the SHA-256 pinned in src/engine/mediapipeAssets.json.
 *
 * Runs on `npm install` (postinstall). A failed download does not fail the
 * install: the app then falls back to downloading the files at runtime and tells
 * the user if that is impossible. Pass --strict to make failures fatal (CI).
 */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'src/engine/mediapipeAssets.json'), 'utf8'));
const outDir = join(root, 'public/mediapipe');
const strict = process.argv.includes('--strict');

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const valid = (path, expected) => existsSync(path) && sha256(readFileSync(path)) === expected;

let failures = 0;
function fail(message) {
  failures += 1;
  console.warn(`[mediapipe] ${message}`);
}

mkdirSync(join(outDir, 'wasm'), { recursive: true });

const wasmSource = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
for (const [file, hash] of Object.entries(manifest.wasm)) {
  const target = join(outDir, 'wasm', file);
  if (valid(target, hash)) continue;
  const source = join(wasmSource, file);
  if (!valid(source, hash)) {
    fail(`${file} in node_modules does not match the pinned hash (is @mediapipe/tasks-vision ${manifest.tasksVisionVersion} installed?)`);
    continue;
  }
  copyFileSync(source, target);
}

for (const { file, url, sha256: hash } of Object.values(manifest.models)) {
  const target = join(outDir, file);
  if (valid(target, hash)) continue;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (sha256(buffer) !== hash) throw new Error('checksum mismatch');
    writeFileSync(target, buffer);
  } catch (error) {
    fail(`could not download ${file}: ${error.message}`);
  }
}

if (failures === 0) {
  console.log('[mediapipe] assets ready in public/mediapipe');
} else if (strict) {
  process.exit(1);
} else {
  console.warn('[mediapipe] continuing; the app will download these files at runtime instead.');
}
