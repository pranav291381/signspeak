import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { buildEngineHtml, engineConfig } from './engineHtml';
import { decodeEngineMessage, encodeMessage, type EngineFacing, type HostToEngine } from './protocol';
import type { LandmarkCameraProps } from './types';
import { useEngineMessages } from './useEngineMessages';

/**
 * Camera preview + on-device hand/pose tracking (phones).
 *
 * The engine page runs in a WebView whose origin is https://localhost, a secure
 * context, so the camera API is available. Camera images never leave the
 * WebView; only landmark numbers are posted back.
 */
export function LandmarkCamera({ facing, active, style, testID, ...handlers }: LandmarkCameraProps) {
  const ref = useRef<WebView>(null);
  const onMessage = useEngineMessages(handlers);

  // Built once per mount: later changes are sent as messages, so the camera
  // does not restart and models are not reloaded.
  const [html] = useState(() => buildEngineHtml(engineConfig({ facing, active, platform: Platform.OS })));

  const send = (message: HostToEngine) => {
    const script = `window.__islEngine&&window.__islEngine.receive(${JSON.stringify(encodeMessage(message))});true;`;
    ref.current?.injectJavaScript(script);
  };

  useEffect(() => {
    send({ type: 'setActive', active });
  }, [active]);

  useEffect(() => {
    send({ type: 'setFacing', facing: facing as EngineFacing });
  }, [facing]);

  return (
    <View style={[styles.container, style]} testID={testID}>
      <WebView
        ref={ref}
        source={{ html, baseUrl: 'https://localhost/' }}
        originWhitelist={['https://*', 'about:*', 'blob:*']}
        onMessage={(event: WebViewMessageEvent) => onMessage(decodeEngineMessage(event.nativeEvent.data))}
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
