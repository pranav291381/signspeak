import { useEffect, useRef } from 'react';

/** Fastest update (ms): about 60 a second, whatever the display's refresh rate. */
const MIN_FRAME_MS = 15;
/** Longest step (ms), so a stall (app in the background, a slow frame) does not jump ahead. */
const MAX_STEP_MS = 100;

/**
 * Calls `onFrame(elapsedMs)` once per display frame while `running`.
 * Timing comes from the clock, so movement keeps its speed on slow phones and
 * simply shows fewer in-between frames.
 */
export function useAnimationFrames(running: boolean, onFrame: (elapsedMs: number) => void): void {
  const handler = useRef(onFrame);
  useEffect(() => {
    handler.current = onFrame;
  });

  useEffect(() => {
    if (!running) return;
    let last = Date.now();
    let id = requestAnimationFrame(function tick() {
      const now = Date.now();
      const elapsed = now - last;
      if (elapsed >= MIN_FRAME_MS) {
        last = now;
        handler.current(Math.min(elapsed, MAX_STEP_MS));
      }
      id = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(id);
  }, [running]);
}
