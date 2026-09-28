#!/usr/bin/env node
/**
 * Builds the motion pack Text → ISL plays: one clean recording per sign, from
 * a landmarks file (npm run export:landmarks). See scripts/lib/motion-pack.ts
 * for how the recording is chosen and cleaned, and docs/sign-packs.md.
 *
 *   npm run build:motions -- --data landmarks.jsonl --out assets/motions/include-motion.signpack \
 *     --id include-motion --name "INCLUDE signs" --source-name "…" --source-url "…" --permission "…"
 *
 * Writes the pack and <out>.report.json (the recording chosen for each sign).
 */
import { build } from 'esbuild';
import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`build-motion-pack: ${message}`);
  process.exit(1);
}

const { values: args } = parseArgs({
  options: {
    data: { type: 'string' },
    out: { type: 'string' },
    id: { type: 'string' },
    name: { type: 'string' },
    'source-name': { type: 'string' },
    'source-url': { type: 'string' },
    permission: { type: 'string' },
    language: { type: 'string', default: 'en' },
    margin: { type: 'string', default: '4' },
  },
});
for (const key of ['data', 'out', 'id', 'name', 'source-name', 'source-url', 'permission']) {
  if (!args[key]) fail(`--${key} is required`);
}
if (!/^[a-z0-9-]+$/.test(args.id)) fail('--id is lowercase letters, digits and -');
const margin = Number(args.margin);
if (!(Number.isInteger(margin) && margin >= 0)) fail('--margin is a whole number of frames');

const outDir = join(root, 'node_modules/.cache/islconnect');
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, 'motion-pack.mjs');
await build({
  entryPoints: [join(root, 'scripts/lib/motion-pack.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: outFile,
  tsconfig: join(root, 'tsconfig.json'),
  logLevel: 'warning',
});
const { buildMotionPack } = await import(pathToFileURL(outFile).href);

const rows = readFileSync(args.data, 'utf8')
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));
const { pack, chosen, skipped } = buildMotionPack(rows, {
  id: args.id,
  name: args.name,
  source: { name: args['source-name'], url: args['source-url'], permission: args.permission },
  language: args.language,
  createdAt: new Date().toISOString(),
  margin,
});
if (pack.signs.length === 0) fail('no sign had a usable recording');

mkdirSync(dirname(args.out), { recursive: true });
writeFileSync(args.out, JSON.stringify(pack));
writeFileSync(`${args.out}.report.json`, JSON.stringify({ chosen, skipped }, null, 2));
const kb = Math.round(Buffer.byteLength(JSON.stringify(pack)) / 1024);
const low = chosen.filter((c) => c.handCoverage < 0.7).map((c) => c.text);
console.log(`${pack.signs.length} signs, ${kb} KB → ${args.out}`);
if (skipped.length > 0) console.log(`no usable recording: ${skipped.join(', ')}`);
if (low.length > 0) console.log(`hands lost for over 30% of the signing, check these: ${low.join(', ')}`);
