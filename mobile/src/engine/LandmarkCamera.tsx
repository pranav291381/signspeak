import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useReduceMotion } from '@/accessibility/useReduceMotion';

import { buildEngineHtml, engineConfig } from './engineHtml';
import { decodeEngineMessage, encodeMessage, type EngineFacing, type HostToEngine } from './protocol';
import type { LandmarkCameraProps } from './types';
import { useEngineMessages } from './useEngineMessages';

/** The phone stopped an engine page in this session (low memory): the next one uses fewer workers. */
let stoppedBefore = false;

/**
 * Camera preview + on-device hand/pose tracking (phones).
 *
 * The engine page runs in a WebView whose origin is https://localhost, a secure
 * context, so the camera API is available. Camera images never leave the
 * WebView; only landmark numbers are posted back.
 */
export function LandmarkCamera({ facing, active, flashSignal = 0, model, style, testID, ...handlers }: LandmarkCameraProps) {
  const ref = useRef<WebView>(null);
  const onMessage = useEngineMessages({ ...handlers, onPrediction: (message) => model?.receive(message) });

  // Built once per mount: later changes are sent as messages, so the camera
  // does not restart and models are not reloaded.
  const reduceMotion = useReduceMotion();
  const [html] = useState(() =>
    buildEngineHtml(engineConfig({ facing, active, platform: Platform.OS, reduceMotion, afterStop: stoppedBefore })),
  );
  const onStopped = () => {
    stoppedBefore = true;
    handlers.onError?.('engine_stopped');
  };

  const send = (message: HostToEngine) => {
    const script = `window.__islEngine&&window.__islEngine.receive(${JSON.stringify(encodeMessage(message))});true;`;
    ref.current?.injectJavaScript(script);
  };

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
    send({ type: 'setFacing', facing: facing as EngineFacing });
  }, [facing]);

  useEffect(() => () => model?.detach(), [model]);

  return (
    <View style={[styles.container, style]} testID={testID}>
      <WebView
        ref={ref}
        source={{ html, baseUrl: 'https://localhost/' }}
        originWhitelist={['https://*', 'about:*', 'blob:*']}
        onMessage={(event: WebViewMessageEvent) => onMessage(decodeEngineMessage(event.nativeEvent.data))}
        // The page's script has run: it takes messages now (again after a reload).
        onLoadEnd={() => model?.attach(send)}
        // The phone may stop the page (e.g. low on memory): report it instead of the app closing.
        onRenderProcessGone={onStopped}
        onContentProcessDidTerminate={onStopped}
        javaScriptEnabled
        mediaCapturePermissionGrantType="grant"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        style={styles.webview}
        // The preview is decorative for screen readers; status is announced by the app.
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: '#0E1014' },
});
