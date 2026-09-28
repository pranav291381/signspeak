import { act, renderHook } from '@testing-library/react-native';

import { FRAME_DIM, LEFT_HAND_PRESENT_INDEX, LEFT_HAND_START, POSE_PRESENT_INDEX } from '../featureSpec';
import { POSE_LEFT_WRIST_Y, POSE_RIGHT_WRIST_Y, REST_WRIST_Y } from '../features';
import { RecognitionSession } from '../session';
import { PredictionStabilizer } from '../stabilizer';
import type { FrameSource, LandmarkFrame, RawPrediction, RecognizerInfo, SignRecognizer } from '../types';
import { useRecognition } from '../useRecognition';

function frame(raised: boolean, t: number): LandmarkFrame {
  const values = new Float32Array(FRAME_DIM);
  values[POSE_PRESENT_INDEX] = 1;
  values[LEFT_HAND_PRESENT_INDEX] = 1;
  values[LEFT_HAND_START + 1] = raised ? 0.3 : REST_WRIST_Y + 0.3;
  values[POSE_LEFT_WRIST_Y] = raised ? 0.3 : REST_WRIST_Y + 0.3;
  values[POSE_RIGHT_WRIST_Y] = REST_WRIST_Y + 0.3;
  return { timestampMs: t, values };
}

class Source implements FrameSource {
  readonly simulated = false;
  handler: ((f: LandmarkFrame) => void) | null = null;
  t = 0;
  start(onFrame: (f: LandmarkFrame) => void) {
    this.handler = onFrame;
  }
  stop() {
    this.handler = null;
  }
  sign() {
    for (const raised of [false, false, ...Array<boolean>(10).fill(true), ...Array<boolean>(5).fill(false)]) {
      this.handler?.(frame(raised, (this.t += 67)));
    }
  }
}

class Recognizer implements SignRecognizer {
  info: RecognizerInfo = { id: 'fake', kind: 'on_device', version: '1', labels: [], calibrated: false, featureSpecVersion: 1, windowSize: 32, mode: 'segment' };
  next: RawPrediction = {
    scores: [
      { label: 'tea', score: 0.8 },
      { label: 'water', score: 0.2 },
    ],
    latencyMs: 1,
  };
  async load() {}
  async predict() {
    return this.next;
  }
  dispose() {}
}

const flush = () => act(() => new Promise<void>((resolve) => setImmediate(resolve)));

it('replaces the last result when the user corrects it', async () => {
  const source = new Source();
  const factory = () =>
    new RecognitionSession({
      source,
      recognizer: new Recognizer(),
      stabilizer: new PredictionStabilizer({ config: { minConfidence: 0.6, minMargin: 0.1 } }),
      config: { mode: 'segment' },
    });
  const { result } = renderHook(() => useRecognition({ demoMode: false, source, active: true, isDisplayable: () => true, factory }));
  await flush();
  act(() => source.sign());
  await flush();
  act(() => source.sign());
  await flush();
  expect(result.current.results.map((r) => r.label)).toEqual(['tea', 'tea']);
  expect(result.current.snapshot?.suggestions).toEqual(['water']);
  act(() => result.current.choose('water'));
  expect(result.current.results.map((r) => r.label)).toEqual(['tea', 'water']);
  expect(result.current.results[1]).toMatchObject({ chosen: true, corrects: true });
});
