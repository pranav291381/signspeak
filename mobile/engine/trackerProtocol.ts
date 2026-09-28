import type { Delegate } from './core';

/** Messages between the engine page and its tracking workers (engine/tracker.ts). */

export type TrackerRole = 'hands' | 'pose';

export interface TrackedPoint {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export type TrackerRequest =
  | {
      type: 'init';
      role: TrackerRole;
      wasmLoaderPath: string;
      wasmBinaryPath: string;
      model: Uint8Array;
      delegate: Delegate;
    }
  /** A camera frame; the worker closes the bitmap. Timestamps rise across all frames. */
  | { type: 'frame'; id: number; timestamp: number; bitmap: ImageBitmap }
  | { type: 'close' };

export type TrackerReply =
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  | {
      type: 'hands';
      id: number;
      ms: number;
      landmarks: TrackedPoint[][];
      handedness: { categoryName: string; score: number }[][];
    }
  | { type: 'pose'; id: number; ms: number; landmarks: TrackedPoint[] | null };
