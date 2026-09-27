import { COORDS, FRAME_DIM, PRESENCE_START } from '@/recognition/featureSpec';

/**
 * Compact storage for landmark frames: values × 1000 as little-endian Int16,
 * base64-encoded (≈ 2.7 bytes per value instead of ~8 as JSON text).
 */

const PRESENCE_FLAGS = FRAME_DIM - PRESENCE_START;

export const VALUE_SCALE = 1000;
const INT16_MAX = 32767;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]));

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const n = (a << 16) | (b << 8) | c;
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63]! : '=';
    out += i + 2 < bytes.length ? ALPHABET[n & 63]! : '=';
  }
  return out;
}

export function base64ToBytes(text: string): Uint8Array {
  if (text.length % 4 !== 0) throw new Error('Invalid base64 length');
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - padding);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const ch = text[i + k]!;
      const v = ch === '=' ? 0 : LOOKUP.get(ch);
      if (v === undefined) throw new Error('Invalid base64 character');
      n = (n << 6) | v;
    }
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

export function encodeFrames(frames: readonly ArrayLike<number>[], dim: number): string {
  const bytes = new Uint8Array(frames.length * dim * 2);
  const view = new DataView(bytes.buffer);
  frames.forEach((frame, f) => {
    if (frame.length !== dim) throw new Error(`Frame ${f} has ${frame.length} values, expected ${dim}`);
    for (let i = 0; i < dim; i++) {
      const raw = frame[i]!;
      const scaled = Number.isFinite(raw) ? Math.round(raw * VALUE_SCALE) : 0;
      view.setInt16((f * dim + i) * 2, Math.max(-INT16_MAX, Math.min(INT16_MAX, scaled)), true);
    }
  });
  return bytesToBase64(bytes);
}

export function decodeFrames(data: string, frames: number, dim: number): Float32Array[] {
  const bytes = base64ToBytes(data);
  if (bytes.length !== frames * dim * 2) throw new Error('Sample size does not match its header');
  const view = new DataView(bytes.buffer);
  const out: Float32Array[] = [];
  for (let f = 0; f < frames; f++) {
    const frame = new Float32Array(dim);
    for (let i = 0; i < dim; i++) frame[i] = view.getInt16((f * dim + i) * 2, true) / VALUE_SCALE;
    out.push(frame);
  }
  return out;
}

/**
 * Frames without depth, for sign packs: x and y of every landmark (feature
 * spec v1 order) followed by the three presence flags. Matching and diagrams
 * use only x and y, so this loses nothing they need and is a third smaller.
 */
export const XY_FRAME_DIM = (FRAME_DIM - PRESENCE_FLAGS) / COORDS * 2 + PRESENCE_FLAGS;

export function toXY(frame: ArrayLike<number>): Float32Array {
  const out = new Float32Array(XY_FRAME_DIM);
  const points = (FRAME_DIM - PRESENCE_FLAGS) / COORDS;
  for (let p = 0; p < points; p++) {
    out[p * 2] = frame[p * COORDS]!;
    out[p * 2 + 1] = frame[p * COORDS + 1]!;
  }
  for (let f = 0; f < PRESENCE_FLAGS; f++) out[points * 2 + f] = frame[PRESENCE_START + f]!;
  return out;
}

/** A spec-v1 frame from an XY frame (depth 0). */
export function fromXY(frame: ArrayLike<number>): Float32Array {
  const out = new Float32Array(FRAME_DIM);
  const points = (FRAME_DIM - PRESENCE_FLAGS) / COORDS;
  for (let p = 0; p < points; p++) {
    out[p * COORDS] = frame[p * 2]!;
    out[p * COORDS + 1] = frame[p * 2 + 1]!;
  }
  for (let f = 0; f < PRESENCE_FLAGS; f++) out[PRESENCE_START + f] = frame[points * 2 + f]!;
  return out;
}

/** Decodes stored frames as spec-v1 frames, whichever of the two layouts they use. */
export function decodeSpecFrames(data: string, frames: number, dim: number): Float32Array[] {
  const decoded = decodeFrames(data, frames, dim);
  if (dim === FRAME_DIM) return decoded;
  if (dim === XY_FRAME_DIM) return decoded.map(fromXY);
  throw new Error(`Unknown frame layout (${dim} values)`);
}
