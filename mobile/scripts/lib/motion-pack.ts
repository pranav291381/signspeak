/**
 * Builds a motion pack for Text → ISL: one clean recording per sign, chosen
 * from recorded landmarks (npm run export:landmarks), tidied for display.
 * Bundled and run by scripts/build-motion-pack.mjs, which reads and writes the files.
 *
 * For each sign the recording is chosen that
 * 1. lost the hands least while signing (the hand tracker drops hands in fast
 *    movement; fewer gaps means less to fill), then
 * 2. is most typical: closest, by dynamic time warping, to the sign's other
 *    recordings, so an unusual take is not picked.
 * Recordings are cleaned first (src/motion/clean.ts: short gaps filled along
 * the tracked wrist, jitter smoothed); the chosen one is trimmed to the signing
 * and stored as a sign pack sample.
 */
import type { LanguageCode } from '@/i18n/languages';
import { fillGaps, smoothFrames, trimToSigning } from '@/motion/clean';
import { signSpan } from '@/motion/segment';
import { decodeSpecFrames, encodeFrames, toXY, XY_FRAME_DIM } from '@/personal/codec';
import { compactSequence } from '@/personal/matcher';
import { subsequenceDtw } from '@/personal/dtw';
import { SAMPLE_FPS } from '@/personal/sample';
import { FEATURE_SPEC_VERSION, LEFT_HAND_PRESENT_INDEX, RIGHT_HAND_PRESENT_INDEX } from '@/recognition/featureSpec';
import { SIGN_PACK_FORMAT, SIGN_PACK_VERSION, type SignPack, type SignPackSource } from '@/signpack/types';

export interface Row {
  text: string;
  group?: string | null;
  category?: string | null;
  recording: { frames: number; dim: number; data: string; missing?: number[] };
}

export interface MotionPackOptions {
  id: string;
  name: string;
  source: SignPackSource;
  language: LanguageCode;
  createdAt: string;
  /** Frames kept before the first and after the last raised frame. */
  margin?: number;
}

export interface ChosenRecording {
  text: string;
  /** Group (recording session) of the chosen recording. */
  group: string | null;
  candidates: number;
  /** Share of the sign (its core) in which the hand tracker saw the hands, before filling gaps (0–1). */
  handCoverage: number;
  frames: number;
}

export interface MotionPackResult {
  pack: SignPack;
  chosen: ChosenRecording[];
  /** Signs with no usable recording (no signing found). */
  skipped: string[];
}

/** Recordings within this much coverage of the best one count as equally clean. */
const COVERAGE_TOLERANCE = 0.08;

export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'sign';

function decodeRow(row: Row): (Float32Array | null)[] {
  const missing = new Set(row.recording.missing ?? []);
  return decodeSpecFrames(row.recording.data, row.recording.frames, row.recording.dim).map((v, i) => (missing.has(i) ? null : v));
}

interface Candidate {
  row: Row;
  /** Gaps filled and smoothed, full length. */
  cleaned: Float32Array[];
  coverage: [number, number];
  compact: Float32Array[];
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function candidate(row: Row): Candidate | null {
  const raw = decodeRow(row);
  const cleaned = smoothFrames(fillGaps(raw));
  const span = signSpan(cleaned);
  if (!span) return null;
  // How often the hand tracker itself saw each hand during the sign (not the rise from rest, which blurs).
  const core = raw.slice(span.coreStart, span.coreEnd + 1);
  const seen = (index: number) => core.filter((f) => f !== null && (f[index] ?? 0) > 0.5).length / core.length;
  return {
    row,
    cleaned,
    coverage: [seen(LEFT_HAND_PRESENT_INDEX), seen(RIGHT_HAND_PRESENT_INDEX)],
    compact: compactSequence(cleaned.slice(span.start, span.end + 1)),
  };
}

/** Hands the sign's recordings usually show count most (a hand resting out of view does not matter). */
function weightedCoverage(c: Candidate, weights: [number, number]): number {
  const total = weights[0] + weights[1];
  return total > 0 ? (c.coverage[0] * weights[0] + c.coverage[1] * weights[1]) / total : 0;
}

function typicality(candidates: readonly Candidate[]): number[] {
  return candidates.map((c, i) => {
    const distances = candidates
      .filter((_, j) => j !== i)
      .map((other) => (subsequenceDtw(c.compact, other.compact) + subsequenceDtw(other.compact, c.compact)) / 2);
    return distances.length > 0 ? median(distances) : 0;
  });
}

export function chooseRecording(rows: readonly Row[]): { row: Row; cleaned: Float32Array[]; coverage: number; candidates: number } | null {
  const candidates = rows.map(candidate).filter((c): c is Candidate => c !== null);
  if (candidates.length === 0) return null;
  const weights: [number, number] = [median(candidates.map((c) => c.coverage[0])), median(candidates.map((c) => c.coverage[1]))];
  const coverages = candidates.map((c) => weightedCoverage(c, weights));
  const best = Math.max(...coverages);
  const clean = candidates.filter((_, i) => coverages[i]! >= best - COVERAGE_TOLERANCE);
  const distances = typicality(candidates);
  const pick = clean.reduce((a, b) => (distances[candidates.indexOf(b)]! < distances[candidates.indexOf(a)]! ? b : a));
  return { row: pick.row, cleaned: pick.cleaned, coverage: coverages[candidates.indexOf(pick)]!, candidates: candidates.length };
}

export function buildMotionPack(rows: readonly Row[], options: MotionPackOptions): MotionPackResult {
  const bySign = new Map<string, Row[]>();
  for (const row of rows) {
    const list = bySign.get(row.text) ?? [];
    list.push(row);
    bySign.set(row.text, list);
  }
  const signs: SignPack['signs'] = [];
  const chosen: ChosenRecording[] = [];
  const skipped: string[] = [];
  const ids = new Set<string>();
  for (const [text, list] of [...bySign.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const pick = chooseRecording(list);
    const id = `${options.id}:${slug(text)}`;
    if (!pick || ids.has(id)) {
      skipped.push(text);
      continue;
    }
    ids.add(id);
    const frames = trimToSigning(pick.cleaned, options.margin ?? 4).map(toXY);
    const category = list.find((r) => r.category)?.category ?? undefined;
    signs.push({
      id,
      text,
      language: options.language,
      ...(category ? { category } : {}),
      samples: [{ frames: frames.length, dim: XY_FRAME_DIM, data: encodeFrames(frames, XY_FRAME_DIM) }],
    });
    chosen.push({ text, group: pick.row.group ?? null, candidates: pick.candidates, handCoverage: Number(pick.coverage.toFixed(3)), frames: frames.length });
  }
  return {
    pack: {
      format: SIGN_PACK_FORMAT,
      version: SIGN_PACK_VERSION,
      id: options.id,
      name: options.name,
      featureSpecVersion: FEATURE_SPEC_VERSION,
      sampleFps: SAMPLE_FPS,
      source: options.source,
      createdAt: options.createdAt,
      signs,
    },
    chosen,
    skipped,
  };
}
