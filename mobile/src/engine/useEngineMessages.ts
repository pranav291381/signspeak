import { useCallback, useEffect, useRef } from 'react';

import type { EngineToHost } from './protocol';
import type { EngineHandlers } from './types';

/** Routes decoded engine messages to the latest handlers without re-creating listeners. */
export function useEngineMessages(handlers: EngineHandlers): (message: EngineToHost | null) => void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  return useCallback((message: EngineToHost | null) => {
    if (!message) return;
    const h = latest.current;
    switch (message.type) {
      case 'frame':
        h.onFrame?.(message.t, message.v, message.hands);
        break;
      case 'status':
        h.onStatus?.(message.status, message.progress);
        break;
      case 'error':
        h.onError?.(message.code);
        break;
      case 'stats':
        h.onStats?.(message.fps, message.inferenceMs, message.delegate);
        break;
      case 'prediction':
        h.onPrediction?.(message);
        break;
    }
  }, []);
}
