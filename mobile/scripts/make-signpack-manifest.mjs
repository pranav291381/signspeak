#!/usr/bin/env node
/**
 * Writes a sign pack manifest for a folder of sign videos, one video per
 * sign, named by what the sign means (as in a YouTube Studio or Google Takeout
 * export, where each file is named by its video title).
 *
 *   npm run manifest:signpack -- <videos folder> --out vocabulary.json \
 *     --id deaf-club-2026 --name "Deaf club recordings" \
 *     --source-name "Example Deaf Club" --source-url https://example.org/ \
 *     --permission "Recorded for SignSpeak by consenting signers (2026)."
 *
 * Only use videos you have the right to use: your own recordings, or videos
 * whose owners gave permission. Do not download videos from YouTube.
 *
 * Review the manifest before building: file names often carry extra words
 * ("Hello - ISL", "Hello (1)") that should not be part of the sign's meaning.
 * Then: npm run build:signpack -- --manifest vocabulary.json --out build/deaf-club-2026.signpack
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.webm', '.mov', '.ogv']);

function fail(message) {
  console.error(`make-signpack-manifest: ${message}`);
  process.exit(1);
}

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    id: { type: 'string' },
    name: { type: 'string' },
    'source-name': { type: 'string' },
    'source-url': { type: 'string' },
    permission: { type: 'string' },
    language: { type: 'string', default: 'en' },
  },
});

if (positionals.length !== 1 || !args.out) fail('give the videos folder and --out <manifest.json>');
const missing = ['id', 'name', 'source-name', 'source-url', 'permission'].filter((key) => !args[key]?.trim());
if (missing.length > 0) fail(`also needed: ${missing.map((key) => `--${key}`).join(', ')}`);

const folder = resolve(positionals[0]);
const outPath = resolve(args.out);

/** Video files under `dir`, in a stable order. */
function videos(dir) {
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) return videos(path);
      return VIDEO_EXTENSIONS.has(extname(entry).toLowerCase()) ? [path] : [];
    });
}

const files = videos(folder);
if (files.length === 0) fail(`no videos (${[...VIDEO_EXTENSIONS].join(', ')}) found in ${folder}`);

const signs = files.map((path) => ({
  // The file name, as given: review it, and fix it in the manifest where needed.
  text: basename(path, extname(path)).replace(/[_\s]+/g, ' ').trim(),
  // Relative to the manifest, with forward slashes, so the manifest works on any system.
  video: relative(dirname(outPath), path).split(sep).join('/'),
}));

writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      id: args.id,
      name: args.name,
      source: { name: args['source-name'], url: args['source-url'], permission: args.permission },
      language: args.language,
      signs,
    },
    null,
    2,
  )}\n`,
);

const repeated = signs.length - new Set(signs.map((s) => s.text.toLowerCase())).size;
console.log(`Wrote ${outPath}: ${signs.length} videos.`);
console.log(`First names: ${signs.slice(0, 8).map((s) => JSON.stringify(s.text)).join(', ')}${signs.length > 8 ? ', …' : ''}`);
if (repeated > 0) console.log(`${repeated} names repeat; those videos become recordings of one sign (variants).`);
console.log('Check the names, then run: npm run build:signpack -- --manifest <manifest> --out build/<id>.signpack');
