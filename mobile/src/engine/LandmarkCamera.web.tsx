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
export function LandmarkCamera({ facing, active, flashSignal = 0, model, style, testID, ...handlers }: LandmarkCameraProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const onMessage = useEngineMessages({ ...handlers, onPrediction: (message) => model?.receive(message) });
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

  useEffect(() => () => model?.detach(), [model]);

  // Messages sent while the page was still loading were lost: once it has loaded,
  // send the current state again, then hand the model its connection.
  const latest = useRef({ active, reduceMotion, facing });
  latest.current = { active, reduceMotion, facing };
  const onLoaded = () => {
    const { active: isActive, reduceMotion: reduce, facing: side } = latest.current;
    send({ type: 'setActive', active: isActive });
    send({ type: 'setReduceMotion', reduceMotion: reduce });
    send({ type: 'setFacing', facing: side });
    model?.attach(send);
  };

  return (
    <View style={[styles.container, style]} testID={testID}>
      <iframe
        ref={frame}
        srcDoc={html}
        allow="camera; autoplay"
        // The page's script has run: it takes messages now.
        onLoad={onLoaded}
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
