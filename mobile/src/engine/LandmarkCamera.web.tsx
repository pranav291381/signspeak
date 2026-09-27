import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/useReduceMotion';

import { buildEngineHtml, engineConfig } from './engineHtml';
import { decodeEngineMessage, encodeMessage, type HostToEngine } from './protocol';
import type { LandmarkCameraProps } from './types';
import { useEngineMessages } from './useEngineMessages';

/**
 * Web version: the same engine page in an iframe (srcdoc, same origin), so the
 * web build runs exactly the code phones run in their WebView.
 */
export function LandmarkCamera({ facing, active, flashSignal = 0, style, testID, ...handlers }: LandmarkCameraProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const onMessage = useEngineMessages(handlers);
  // Built once per mount: later changes are sent as messages (no camera restart).
  const reduceMotion = useReduceMotion();
  const [html] = useState(() =>
    buildEngineHtml(engineConfig({ facing, active, platform: 'web', origin: globalThis.location?.origin, reduceMotion })),
  );

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      onMessage(decodeEngineMessage(event.data));
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [onMessage]);

  const send = (message: HostToEngine) => frame.current?.contentWindow?.postMessage(encodeMessage(message), '*');

  useEffect(() => {
    send({ type: 'setActive', active });
  }, [active]);

  useEffect(() => {
    if (flashSignal > 0) send({ type: 'flash' });
  }, [flashSignal]);

  useEffect(() => {
    send({ type: 'setReduceMotion', reduceMotion });
  }, [reduceMotion]);

  useEffect(() => {
    send({ type: 'setFacing', facing });
  }, [facing]);

  return (
    <View style={[styles.container, style]} testID={testID}>
      <iframe
        ref={frame}
        srcDoc={html}
        allow="camera; autoplay"
        aria-hidden
        tabIndex={-1}
        style={{ border: 0, width: '100%', height: '100%', display: 'block' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});
