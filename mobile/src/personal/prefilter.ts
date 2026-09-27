import { COMPACT_DIM, frameDistanceAt } from './compact';
import type { PreparedQuery, SignTemplate } from './matcher';

/**
 * Fast first pass for large vocabularies (a dictionary sign pack).
 *
 * Full DTW against thousands of signs is too slow to run several times a
 * second, so each sign's core is reduced to a few frames and the query to half
 * its frame rate, and those are compared by the same subsequence DTW (so any
 * timing, speed or pause before and after still matches). Only the signs
 * closest in this coarse comparison are then matched in full. A sign missed
 * here is reported as "not sure", never as another sign.
 */

/** Frames kept of each sign's core. */
export const EMBED_FRAMES = 5;
const EMBED_SIZE = EMBED_FRAMES * COMPACT_DIM;
/** The query is compared at 1 / QUERY_STEP of its frame rate. */
const QUERY_STEP = 3;

/** Writes `sequence` resampled to EMBED_FRAMES frames (nearest frame) at `out[at]`. */
function writeEmbedding(sequence: readonly Float32Array[], out: Float32Array, at: number): void {
  const last = sequence.length - 1;
  for (let k = 0; k < EMBED_FRAMES; k++) {
    out.set(sequence[Math.round((k * last) / (EMBED_FRAMES - 1))]!, at + k * COMPACT_DIM);
  }
}

/** Every QUERY_STEP-th frame, ending with the latest, packed. */
function downsample(sequence: readonly Float32Array[]): Float32Array {
  const count = Math.ceil(sequence.length / QUERY_STEP);
  const out = new Float32Array(count * COMPACT_DIM);
  for (let j = 0; j < count; j++) {
    out.set(sequence[sequence.length - 1 - (count - 1 - j) * QUERY_STEP]!, j * COMPACT_DIM);
  }
  return out;
}

/**
 * Subsequence DTW of an embedded core (at `ao`) against a packed query of `n`
 * frames, as in dtw.ts, given up (Infinity) once every path costs at least
 * `limit` (normalized). Reuses `rows` (4 × n) as scratch space.
 */
function coarseDtw(a: Float32Array, ao: number, q: Float32Array, n: number, limit: number, rows: Float64Array): number {
  const m = EMBED_FRAMES;
  let prevCost = 0;
  let prevStart = n;
  let cost = 2 * n;
  let start = 3 * n;
  let rowMin = Infinity;
  for (let j = 0; j < n; j++) {
    rows[prevCost + j] = 2 * frameDistanceAt(a, ao, q, j * COMPACT_DIM);
    rows[prevStart + j] = j;
    rowMin = Math.min(rowMin, rows[prevCost + j]!);
  }
  for (let i = 1; i < m; i++) {
    // Any path's total is at least this row's minimum; its normalizer at most m + n.
    if (rowMin / (m + n) >= limit) return Infinity;
    rowMin = Infinity;
    const ai = ao + i * COMPACT_DIM;
    for (let j = 0; j < n; j++) {
      const d = frameDistanceAt(a, ai, q, j * COMPACT_DIM);
      let best = rows[prevCost + j]! + d;
      let from = rows[prevStart + j]!;
      if (j > 0) {
        const diagonal = rows[prevCost + j - 1]! + 2 * d;
        if (diagonal < best) {
          best = diagonal;
          from = rows[prevStart + j - 1]!;
        }
        const horizontal = rows[cost + j - 1]! + d;
        if (horizontal < best) {
          best = horizontal;
          from = rows[start + j - 1]!;
        }
      }
      rows[cost + j] = best;
      rows[start + j] = from;
      if (best < rowMin) rowMin = best;
    }
    [prevCost, cost] = [cost, prevCost];
    [prevStart, start] = [start, prevStart];
  }
  let result = Infinity;
  for (let j = 0; j < n; j++) {
    const normalized = rows[prevCost + j]! / (m + (j - rows[prevStart + j]! + 1));
    if (normalized < result) result = normalized;
  }
  return result < limit ? result : Infinity;
}

export class PrefilterIndex {
  /** Embedding of every template core, packed. */
  private readonly embeddings: Float32Array;
  /** Cores of template t are coreStart[t] … coreStart[t + 1] − 1. */
  private readonly coreStart: Int32Array;

  constructor(private readonly templates: readonly SignTemplate[]) {
    this.coreStart = new Int32Array(templates.length + 1);
    templates.forEach((t, i) => {
      this.coreStart[i + 1] = this.coreStart[i]! + t.cores.length;
    });
    this.embeddings = new Float32Array(this.coreStart[templates.length]! * EMBED_SIZE);
    let c = 0;
    for (const template of templates) {
      for (const core of template.cores) {
        writeEmbedding(core, this.embeddings, c * EMBED_SIZE);
        c += 1;
      }
    }
  }

  get size(): number {
    return this.templates.length;
  }

  /**
   * The `count` templates closest to the query, closest first. Distances are
   * relative to each sign's acceptance distance, as in the final match.
   */
  candidates(query: PreparedQuery, count: number): SignTemplate[] {
    const variants = [downsample(query.normal), downsample(query.mirrored)];
    const n = variants[0]!.length / COMPACT_DIM;
    const rows = new Float64Array(4 * n);
    // The best `count` so far, ascending; a template that cannot beat the last is abandoned early.
    const top: { score: number; index: number }[] = [];
    for (let t = 0; t < this.templates.length; t++) {
      const threshold = this.templates[t]!.threshold;
      const cutoff = top.length === count ? top[count - 1]!.score : Infinity;
      let best = cutoff * threshold;
      for (let c = this.coreStart[t]!; c < this.coreStart[t + 1]!; c++) {
        for (const variant of variants) {
          best = Math.min(best, coarseDtw(this.embeddings, c * EMBED_SIZE, variant, n, best, rows));
        }
      }
      const score = best / threshold;
      if (score >= cutoff) continue;
      let at = top.length;
      while (at > 0 && top[at - 1]!.score > score) at -= 1;
      top.splice(at, 0, { score, index: t });
      if (top.length > count) top.pop();
    }
    return top.map((entry) => this.templates[entry.index]!);
  }
}
