import { decodeTensor, transformerWeightShapes, type EncodedTensor, type TransformerConfig } from './modelPack';

/**
 * Inference for the whole-sign transformer (ml/signspeak_ml/models/segment_transformer.py)
 * in plain TypeScript: per-frame LayerNorm → linear projection + learned position
 * embedding → pre-norm encoder layers (multi-head self-attention, GELU
 * feed-forward) → LayerNorm → mean over frames → linear classifier. A parity test
 * pins it to PyTorch (shared/fixtures/segment_parity_v2.json).
 */

const EPS = 1e-5;

/** erf, Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7). */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return sign * y;
}

const gelu = (x: number) => 0.5 * x * (1 + erf(x / Math.SQRT2));

/** LayerNorm of each of `rows` rows of `size` values. */
function layerNorm(x: Float64Array, rows: number, size: number, gamma: Float32Array, beta: Float32Array): Float64Array {
  const out = new Float64Array(rows * size);
  for (let r = 0; r < rows; r++) {
    let mean = 0;
    for (let i = 0; i < size; i++) mean += x[r * size + i]!;
    mean /= size;
    let variance = 0;
    for (let i = 0; i < size; i++) variance += (x[r * size + i]! - mean) ** 2;
    const scale = 1 / Math.sqrt(variance / size + EPS);
    for (let i = 0; i < size; i++) out[r * size + i] = (x[r * size + i]! - mean) * scale * gamma[i]! + beta[i]!;
  }
  return out;
}

/** y = x Wᵀ + b for each of `rows` rows (W: out × in, row-major, as PyTorch's Linear). */
function linear(x: Float64Array, rows: number, inSize: number, weight: Float32Array, bias: Float32Array): Float64Array {
  const outSize = bias.length;
  const out = new Float64Array(rows * outSize);
  for (let r = 0; r < rows; r++) {
    for (let o = 0; o < outSize; o++) {
      let s = bias[o]!;
      const w = o * inSize;
      const xr = r * inSize;
      for (let i = 0; i < inSize; i++) s += weight[w + i]! * x[xr + i]!;
      out[r * outSize + o] = s;
    }
  }
  return out;
}

export class TransformerModel {
  private readonly w: Record<string, Float32Array> = {};

  constructor(private readonly model: { config: TransformerConfig; weights: Record<string, EncodedTensor> }) {
    for (const key of Object.keys(transformerWeightShapes(model.config))) this.w[key] = decodeTensor(model.weights[key]!);
  }

  /** Logits for a sign resampled to `config.frames` frames of `config.inputDim` values. */
  forward(frames: readonly ArrayLike<number>[]): Float64Array {
    const { inputDim: d, frames: steps, width, layers, heads, numClasses } = this.model.config;
    if (frames.length !== steps) throw new Error(`expected ${steps} frames, got ${frames.length}`);
    const input = new Float64Array(steps * d);
    frames.forEach((frame, t) => {
      for (let i = 0; i < d; i++) input[t * d + i] = frame[i] ?? 0;
    });
    let h = linear(layerNorm(input, steps, d, this.w['input_norm.weight']!, this.w['input_norm.bias']!), steps, d, this.w['embed.weight']!, this.w['embed.bias']!);
    const position = this.w.position!;
    for (let i = 0; i < h.length; i++) h[i] = h[i]! + position[i]!;

    const headSize = width / heads;
    const scale = 1 / Math.sqrt(headSize);
    for (let layer = 0; layer < layers; layer++) {
      const p = `layers.${layer}.`;
      // Self-attention on the normalised frames, added back.
      const y = layerNorm(h, steps, width, this.w[`${p}norm1.weight`]!, this.w[`${p}norm1.bias`]!);
      const qkv = linear(y, steps, width, this.w[`${p}attention.in.weight`]!, this.w[`${p}attention.in.bias`]!);
      const attended = new Float64Array(steps * width);
      const scores = new Float64Array(steps);
      for (let head = 0; head < heads; head++) {
        const offset = head * headSize;
        for (let t = 0; t < steps; t++) {
          let max = -Infinity;
          for (let s = 0; s < steps; s++) {
            let dot = 0;
            for (let j = 0; j < headSize; j++) dot += qkv[t * 3 * width + offset + j]! * qkv[s * 3 * width + width + offset + j]!;
            scores[s] = dot * scale;
            max = Math.max(max, scores[s]!);
          }
          let total = 0;
          for (let s = 0; s < steps; s++) {
            scores[s] = Math.exp(scores[s]! - max);
            total += scores[s]!;
          }
          for (let s = 0; s < steps; s++) {
            const weight = scores[s]! / total;
            for (let j = 0; j < headSize; j++) {
              attended[t * width + offset + j] = attended[t * width + offset + j]! + weight * qkv[s * 3 * width + 2 * width + offset + j]!;
            }
          }
        }
      }
      const attention = linear(attended, steps, width, this.w[`${p}attention.out.weight`]!, this.w[`${p}attention.out.bias`]!);
      for (let i = 0; i < h.length; i++) h[i] = h[i]! + attention[i]!;
      // Feed-forward on the normalised frames, added back.
      const z = layerNorm(h, steps, width, this.w[`${p}norm2.weight`]!, this.w[`${p}norm2.bias`]!);
      const hidden = linear(z, steps, width, this.w[`${p}ff1.weight`]!, this.w[`${p}ff1.bias`]!).map(gelu);
      const ff = linear(hidden, steps, 2 * width, this.w[`${p}ff2.weight`]!, this.w[`${p}ff2.bias`]!);
      for (let i = 0; i < h.length; i++) h[i] = h[i]! + ff[i]!;
    }

    h = layerNorm(h, steps, width, this.w['output_norm.weight']!, this.w['output_norm.bias']!);
    const pooled = new Float64Array(width);
    for (let t = 0; t < steps; t++) for (let i = 0; i < width; i++) pooled[i] = pooled[i]! + h[t * width + i]! / steps;
    return linear(pooled, 1, width, this.w['head.weight']!, this.w['head.bias']!).subarray(0, numClasses);
  }
}
