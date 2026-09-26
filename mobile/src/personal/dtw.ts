import { frameDistance } from './compact';

/**
 * Subsequence dynamic time warping: the best-matching stretch of `query` for the
 * whole of `template`, tolerant to signing faster or slower.
 *
 * Symmetric step pattern (diagonal steps count twice), normalized by
 * template length + matched query length, so the result is an average frame
 * distance that is comparable between templates of different lengths.
 * Returns Infinity when either sequence is empty.
 */
export function subsequenceDtw(template: readonly Float32Array[], query: readonly Float32Array[]): number {
  const m = template.length;
  const n = query.length;
  if (m === 0 || n === 0) return Infinity;

  let prevCost = new Float64Array(n);
  let prevStart = new Int32Array(n);
  let cost = new Float64Array(n);
  let start = new Int32Array(n);

  for (let j = 0; j < n; j++) {
    prevCost[j] = 2 * frameDistance(template[0]!, query[j]!);
    prevStart[j] = j;
  }
  for (let i = 1; i < m; i++) {
    const t = template[i]!;
    for (let j = 0; j < n; j++) {
      const d = frameDistance(t, query[j]!);
      // Vertical step (template advances, query stays).
      let best = prevCost[j]! + d;
      let from = prevStart[j]!;
      if (j > 0) {
        const diagonal = prevCost[j - 1]! + 2 * d;
        if (diagonal < best) {
          best = diagonal;
          from = prevStart[j - 1]!;
        }
        const horizontal = cost[j - 1]! + d;
        if (horizontal < best) {
          best = horizontal;
          from = start[j - 1]!;
        }
      }
      cost[j] = best;
      start[j] = from;
    }
    [prevCost, cost] = [cost, prevCost];
    [prevStart, start] = [start, prevStart];
  }

  let result = Infinity;
  for (let j = 0; j < n; j++) {
    const normalized = prevCost[j]! / (m + (j - prevStart[j]! + 1));
    if (normalized < result) result = normalized;
  }
  return result;
}
