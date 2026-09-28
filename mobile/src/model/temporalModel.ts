import { decodeTensor, weightShapes, type EncodedTensor, type ModelConfig } from './modelPack';

/**
 * Inference for the trained sign model (ml/signspeak_ml/models/temporal.py) in
 * plain TypeScript, so it runs in Expo Go and on the web without a native
 * runtime. Per-frame LayerNorm → 2 × (1D convolution + GELU; batch norm folded
 * in by the exporter) → bidirectional GRU → attention pooling over frames with
 * someone in view → linear classifier. A parity test pins it to PyTorch
 * (shared/fixtures/model_parity_v1.json).
 */

const LAYER_NORM_EPS = 1e-5;

/** erf, Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7). */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return sign * y;
}

/** Exact GELU, as PyTorch's default. */
const gelu = (x: number) => 0.5 * x * (1 + erf(x / Math.SQRT2));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function softmax(logits: ArrayLike<number>, temperature = 1): Float64Array {
  const out = new Float64Array(logits.length);
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i]! / temperature);
  let total = 0;
  for (let i = 0; i < logits.length; i++) {
    out[i] = Math.exp(logits[i]! / temperature - max);
    total += out[i]!;
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / total;
  return out;
}

export class TemporalModel {
  private readonly w: Record<string, Float32Array> = {};
  readonly config: ModelConfig;

  /** One network: a window pack's, or a member of a segment pack. */
  constructor(model: { config: ModelConfig; weights: Record<string, EncodedTensor> }) {
    this.config = model.config;
    for (const key of Object.keys(weightShapes(model.config))) this.w[key] = decodeTensor(model.weights[key]!);
  }

  /** Logits for one window of frames (each `inputDim` values). */
  forward(frames: readonly ArrayLike<number>[]): Float64Array {
    const { inputDim: d, convChannels: c, hiddenSize: h, numClasses: n } = this.config;
    const steps = frames.length;
    const present: boolean[] = frames.map((f) => (f[d - 3] ?? 0) > 0.5);

    // Per-frame LayerNorm.
    const gamma = this.w['input_norm.weight']!;
    const beta = this.w['input_norm.bias']!;
    let x: Float64Array = new Float64Array(steps * d);
    frames.forEach((frame, t) => {
      let mean = 0;
      for (let i = 0; i < d; i++) mean += frame[i] ?? 0;
      mean /= d;
      let variance = 0;
      for (let i = 0; i < d; i++) variance += ((frame[i] ?? 0) - mean) ** 2;
      const scale = 1 / Math.sqrt(variance / d + LAYER_NORM_EPS);
      for (let i = 0; i < d; i++) x[t * d + i] = ((frame[i] ?? 0) - mean) * scale * gamma[i]! + beta[i]!;
    });

    x = this.conv(x, steps, d, 'conv1');
    x = this.conv(x, steps, c, 'conv2');

    const forward = this.gru(x, steps, c, '', false);
    const backward = this.gru(x, steps, c, '_reverse', true);

    // Attention pooling over frames with someone in view (all frames if none).
    const any = present.some(Boolean);
    const aw = this.w['attention.weight']!;
    const ab = this.w['attention.bias']![0]!;
    const scores = new Float64Array(steps);
    let max = -Infinity;
    for (let t = 0; t < steps; t++) {
      if (any && !present[t]) {
        scores[t] = -Infinity;
        continue;
      }
      let s = ab;
      for (let j = 0; j < h; j++) s += aw[j]! * forward[t * h + j]! + aw[h + j]! * backward[t * h + j]!;
      scores[t] = s;
      max = Math.max(max, s);
    }
    const pooled = new Float64Array(2 * h);
    let total = 0;
    for (let t = 0; t < steps; t++) {
      if (scores[t] === -Infinity) continue;
      const weight = Math.exp(scores[t]! - max);
      total += weight;
      for (let j = 0; j < h; j++) {
        pooled[j] = pooled[j]! + weight * forward[t * h + j]!;
        pooled[h + j] = pooled[h + j]! + weight * backward[t * h + j]!;
      }
    }
    for (let j = 0; j < 2 * h; j++) pooled[j] = pooled[j]! / total;

    const hw = this.w['head.weight']!;
    const hb = this.w['head.bias']!;
    const logits = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      let s = hb[k]!;
      for (let j = 0; j < 2 * h; j++) s += hw[k * 2 * h + j]! * pooled[j]!;
      logits[k] = s;
    }
    return logits;
  }

  /** 1D convolution over time ('same' zero padding) followed by GELU. */
  private conv(input: Float64Array, steps: number, inChannels: number, name: 'conv1' | 'conv2'): Float64Array {
    const { convChannels: out, kernelSize: k } = this.config;
    const weight = this.w[`${name}.weight`]!;
    const bias = this.w[`${name}.bias`]!;
    const pad = (k - 1) / 2;
    const result = new Float64Array(steps * out);
    for (let t = 0; t < steps; t++) {
      for (let o = 0; o < out; o++) {
        let s = bias[o]!;
        for (let j = 0; j < k; j++) {
          const source = t + j - pad;
          if (source < 0 || source >= steps) continue;
          const row = source * inChannels;
          for (let i = 0; i < inChannels; i++) s += weight[(o * inChannels + i) * k + j]! * input[row + i]!;
        }
        result[t * out + o] = gelu(s);
      }
    }
    return result;
  }

  /** One direction of the GRU (PyTorch gate order r, z, n). */
  private gru(input: Float64Array, steps: number, inSize: number, suffix: string, reverse: boolean): Float64Array {
    const h = this.config.hiddenSize;
    const wi = this.w[`gru.weight_ih_l0${suffix}`]!;
    const wh = this.w[`gru.weight_hh_l0${suffix}`]!;
    const bi = this.w[`gru.bias_ih_l0${suffix}`]!;
    const bh = this.w[`gru.bias_hh_l0${suffix}`]!;
    const out = new Float64Array(steps * h);
    let state = new Float64Array(h);
    const gi = new Float64Array(3 * h);
    const gh = new Float64Array(3 * h);
    for (let step = 0; step < steps; step++) {
      const t = reverse ? steps - 1 - step : step;
      for (let g = 0; g < 3 * h; g++) {
        let si = bi[g]!;
        for (let i = 0; i < inSize; i++) si += wi[g * inSize + i]! * input[t * inSize + i]!;
        gi[g] = si;
        let sh = bh[g]!;
        for (let j = 0; j < h; j++) sh += wh[g * h + j]! * state[j]!;
        gh[g] = sh;
      }
      const next = new Float64Array(h);
      for (let j = 0; j < h; j++) {
        const r = sigmoid(gi[j]! + gh[j]!);
        const z = sigmoid(gi[h + j]! + gh[h + j]!);
        const candidate = Math.tanh(gi[2 * h + j]! + r * gh[2 * h + j]!);
        next[j] = (1 - z) * candidate + z * state[j]!;
        out[t * h + j] = next[j]!;
      }
      state = next;
    }
    return out;
  }
}
