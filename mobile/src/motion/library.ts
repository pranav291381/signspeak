import { skeletonFrame } from '@/diagram/skeleton';
import type { MotionClip } from '@/diagram/timeline';
import type { LanguageCode } from '@/i18n/languages';
import { decodeSpecFrames } from '@/personal/codec';
import type { SignPack, SignPackSample, SignPackSource } from '@/signpack/types';

import { fillGaps, smoothFrames } from './clean';
import { signSpan } from './segment';
import { signKeys } from './words';

/**
 * Recorded signs to show in Text → ISL, from the installed motion packs
 * (scripts/build-motion-pack.mjs: one cleaned recording per sign).
 */

export interface MotionSign {
  id: string;
  /** Name of the sign as the source gives it. */
  text: string;
  language: LanguageCode;
  category?: string;
  packId: string;
  sample: SignPackSample;
}

export interface MotionPackInfo {
  id: string;
  name: string;
  source: SignPackSource;
  signCount: number;
}

export interface MotionLibrary {
  packs: MotionPackInfo[];
  signs: readonly MotionSign[];
  /** Categories in the order they first appear. */
  categories: string[];
  get(id: string): MotionSign | undefined;
  /** Signs a phrase (see words.ts phraseOf) finds, best first. */
  find(phrase: string): MotionSign[];
  /** The sign's recording, ready to play; null if it cannot be read. */
  clip(id: string): MotionClip | null;
}

/** A recording ready to play: skeletons and where the sign is in it. */
export function clipFromFrames(frames: readonly Float32Array[]): MotionClip {
  return { skeletons: frames.map(skeletonFrame), span: signSpan(frames) };
}

/** A recording made on the phone, tidied like the pack recordings (gaps filled, jitter smoothed). */
export function clipFromRecording(frames: readonly Float32Array[]): MotionClip {
  return clipFromFrames(smoothFrames(fillGaps(frames)));
}

export function buildMotionLibrary(packs: readonly SignPack[]): MotionLibrary {
  const signs: MotionSign[] = [];
  const byId = new Map<string, MotionSign>();
  // Each phrase keeps the signs it finds; a sign whose full name is the phrase comes first.
  const index = new Map<string, { sign: MotionSign; exact: boolean }[]>();
  for (const pack of packs) {
    for (const entry of pack.signs) {
      if (byId.has(entry.id) || !entry.samples[0]) continue;
      const sign: MotionSign = {
        id: entry.id,
        text: entry.text,
        language: entry.language,
        ...(entry.category ? { category: entry.category } : {}),
        packId: pack.id,
        sample: entry.samples[0],
      };
      signs.push(sign);
      byId.set(sign.id, sign);
      signKeys(sign.text).forEach((key, k) => {
        const list = index.get(key) ?? [];
        list.push({ sign, exact: k === 0 });
        index.set(key, list);
      });
    }
  }
  for (const list of index.values()) list.sort((a, b) => Number(b.exact) - Number(a.exact));

  const clips = new Map<string, MotionClip | null>();
  return {
    packs: packs.map((p) => ({ id: p.id, name: p.name, source: p.source, signCount: p.signs.length })),
    signs,
    categories: [...new Set(signs.map((s) => s.category).filter((c): c is string => Boolean(c)))],
    get: (id) => byId.get(id),
    find: (phrase) => (index.get(phrase) ?? []).map((e) => e.sign),
    clip(id) {
      if (clips.has(id)) return clips.get(id)!;
      const sign = byId.get(id);
      let clip: MotionClip | null = null;
      if (sign) {
        try {
          clip = clipFromFrames(decodeSpecFrames(sign.sample.data, sign.sample.frames, sign.sample.dim));
        } catch {
          clip = null;
        }
      }
      clips.set(id, clip);
      return clip;
    },
  };
}
