import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { BUNDLED_SIGN_PACKS, type BundledSignPack } from './bundled';
import { parseSignPack } from './parse';
import type { SignPack } from './types';

/** Text of a bundled asset (a .signpack file). */
export async function readAssetText(module: number): Promise<string> {
  const asset = Asset.fromModule(module);
  if (Platform.OS === 'web') return (await fetch(asset.uri)).text();
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (/^https?:/.test(uri)) return (await fetch(uri)).text();
  return new File(uri).text();
}

export interface LoadedPacks {
  packs: SignPack[];
  /** Packs that could not be read or did not fit this app. */
  failed: string[];
}

export type PackLoader = () => Promise<LoadedPacks>;

/** Reads every sign pack shipped with the app. A broken pack is reported, not fatal. */
export async function loadBundledPacks(
  bundled: readonly BundledSignPack[] = BUNDLED_SIGN_PACKS,
  read: (module: number) => Promise<string> = readAssetText,
): Promise<LoadedPacks> {
  const packs: SignPack[] = [];
  const failed: string[] = [];
  for (const entry of bundled) {
    try {
      packs.push(parseSignPack(JSON.parse(await read(entry.asset))).pack);
    } catch {
      failed.push(entry.id);
    }
  }
  return { packs, failed };
}
