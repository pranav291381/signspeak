import { useEffect } from 'react';
import { View } from 'react-native';

import type { EngineErrorCode, EngineStatus } from '@/engine/protocol';
import type { LandmarkCameraProps } from '@/engine/types';

/**
 * Stand-in for the WebView camera in Jest (installed in jest.setup.ts).
 * Tests drive it like the real engine: status changes, errors and frames.
 */
export const fakeCamera = {
  props: null as LandmarkCameraProps | null,
  status(status: EngineStatus, progress?: number) {
    fakeCamera.props?.onStatus?.(status, progress);
  },
  error(code: EngineErrorCode) {
    fakeCamera.props?.onError?.(code);
  },
  frame(timestampMs: number, values: ArrayLike<number> | null) {
    const list = values ? Array.from(values) : null;
    const hands = list ? Number((list[154] ?? 0) > 0.5) + Number((list[155] ?? 0) > 0.5) : 0;
    fakeCamera.props?.onFrame?.(timestampMs, list, hands);
  },
  reset() {
    fakeCamera.props = null;
  },
};

export function LandmarkCamera(props: LandmarkCameraProps) {
  useEffect(() => {
    fakeCamera.props = props;
  });
  return <View testID={props.testID ?? 'landmark-camera'} />;
}
