#!/usr/bin/env node
/**
 * Adds a sign pack to the app (or removes one), and updates the list of
 * bundled packs in src/signpack/bundled.ts.
 *
 *   npm run install:signpack -- build/isl-dictionary.signpack
 *   npm run install:signpack -- --remove isl-dictionary
 *   npm run install:signpack -- --list
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = join(root, 'assets/signpacks');
const registry = join(root, 'src/signpack/bundled.ts');

function fail(message) {
  console.error(`install-sign-pack: ${message}`);
  process.exit(1);
}

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: { remove: { type: 'string' }, list: { type: 'boolean' } },
});

function readPack(path) {
  let pack;
  try {
    pack = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`cannot read ${path}: ${error.message}`);
  }
  const model = pack?.format === 'islconnect-model-pack';
  if (!model && (pack?.format !== 'islconnect-sign-pack' || pack.version !== 1)) fail(`${path} is not a sign pack or model this app can read`);
  if (typeof pack.id !== 'string' || !/^[a-z0-9-]+$/.test(pack.id)) fail(`${path} has no valid id`);
  if (!pack.source?.name || !pack.source?.url || !pack.source?.permission) fail(`${path} does not say where its signs come from`);
  const signs = model ? pack.labels?.filter((l) => l.id !== pack.unknownLabel) : pack.signs;
  if (!Array.isArray(signs) || signs.length === 0) fail(`${path} has no signs`);
  return { ...pack, signCount: signs.length, kind: model ? 'model' : 'sign pack' };
}

function installed() {
  if (!existsSync(assetDir)) return [];
  return readdirSync(assetDir)
    .filter((file) => file.endsWith('.signpack'))
    .map((file) => file.slice(0, -'.signpack'.length))
    .sort();
}

function writeRegistry() {
  const ids = installed();
  const entries = ids.map((id) => `  { id: '${id}', asset: require('../../assets/signpacks/${id}.signpack') },`).join('\n');
  writeFileSync(
    registry,
    `// Sign packs shipped with the app, in assets/signpacks/.
// Written by \`npm run install:signpack\`; do not edit by hand.
${ids.length > 0 ? '/* eslint-disable @typescript-eslint/no-require-imports -- Metro bundles assets through require() */\n' : ''}
export interface BundledSignPack {
  id: string;
  /** require() of the .signpack asset. */
  asset: number;
}

export const BUNDLED_SIGN_PACKS: readonly BundledSignPack[] = [${ids.length > 0 ? `\n${entries}\n` : ''}];
`,
  );
  return ids;
}

if (args.list) {
  for (const id of installed()) {
    const pack = readPack(join(assetDir, `${id}.signpack`));
    console.log(`${id}: ${pack.kind}, ${pack.name}, ${pack.signCount} signs, ${Math.round(statSync(join(assetDir, `${id}.signpack`)).size / 1024)} KB (${pack.source.name})`);
  }
} else if (args.remove) {
  const path = join(assetDir, `${args.remove}.signpack`);
  if (!existsSync(path)) fail(`no installed pack called ${args.remove}`);
  rmSync(path);
  writeRegistry();
  console.log(`Removed ${args.remove}.`);
} else {
  if (positionals.length !== 1) fail('give the pack file to install, or --remove <id>, or --list');
  const source = resolve(positionals[0]);
  const pack = readPack(source);
  mkdirSync(assetDir, { recursive: true });
  copyFileSync(source, join(assetDir, `${pack.id}.signpack`));
  const ids = writeRegistry();
  console.log(`Installed ${pack.id} (${pack.kind}, ${pack.signCount} signs). Packs in the app: ${ids.join(', ')}.`);
}
