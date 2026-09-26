import fixture from '../../../../shared/fixtures/feature_parity_v1.json';
import appPackage from '../../../package.json';
import { cameraErrorCode, FrameMeter, frameValues, pickHands, wasmFiles } from '../../../engine/core';
import { engineAssetSources, engineHashes, HAND_MODEL_KEY, POSE_MODEL_KEY, remoteSource } from '../assets';
import { EngineFrameSource } from '../EngineFrameSource';
import { buildEngineHtml, engineConfig } from '../engineHtml';
import manifest from '../mediapipeAssets.json';
import { decodeEngineMessage, decodeHostMessage, encodeMessage } from '../protocol';

const both = fixture.cases.find((c) => c.name === 'both hands')!;
const pts = (raw: unknown) => raw as { x: number; y: number; z: number }[];

describe('engine protocol', () => {
  it('round-trips messages in both directions', () => {
    const frame = { type: 'frame', t: 5, v: [0.1, 0.2], hands: 1 } as const;
    expect(decodeEngineMessage(encodeMessage(frame))).toEqual(frame);
    expect(decodeHostMessage(encodeMessage({ type: 'setActive', active: false }))).toEqual({ type: 'setActive', active: false });
    expect(decodeHostMessage(encodeMessage({ type: 'setFacing', facing: 'front' }))).toEqual({ type: 'setFacing', facing: 'front' });
  });

  it('ignores messages that are not from the engine or are malformed', () => {
    expect(decodeEngineMessage('not json')).toBeNull();
    expect(decodeEngineMessage(JSON.stringify({ type: 'frame' }))).toBeNull();
    expect(decodeEngineMessage(JSON.stringify({ tag: 'isl-engine', payload: { type: 'hack' } }))).toBeNull();
    expect(decodeHostMessage(encodeMessage({ type: 'setFacing', facing: 'sideways' }))).toBeNull();
    expect(decodeHostMessage(encodeMessage({ type: 'setActive', active: 'yes' }))).toBeNull();
  });
});

describe('engine core', () => {
  const hand = pts(both.left);
  const other = pts(both.right);

  it('assigns hands by MediaPipe handedness and keeps the more confident duplicate', () => {
    const result = pickHands({
      landmarks: [hand, other, hand],
      handedness: [
        [{ categoryName: 'Left', score: 0.6 }],
        [{ categoryName: 'Left', score: 0.9 }],
        [{ categoryName: 'Unknown', score: 1 }],
      ],
    });
    expect(result.left).toBe(other);
    expect(result.right).toBeNull();
    expect(result.count).toBe(3);
  });

  it('builds a rounded spec-v1 vector, or null when nobody usable is in view', () => {
    const hands = { landmarks: [hand], handedness: [[{ categoryName: 'Right', score: 0.9 }]] };
    const { values } = frameValues(pts(both.pose), hands);
    expect(values).toHaveLength(156);
    expect(values!.slice(153)).toEqual([1, 0, 1]);
    expect(values!.every((v) => Math.abs(v * 1e4 - Math.round(v * 1e4)) < 1e-6)).toBe(true);
    expect(frameValues(undefined, hands)).toEqual({ values: null, hands: 1 });

    const degenerate = fixture.cases.find((c) => c.name === 'degenerate shoulders')!;
    expect(frameValues(pts(degenerate.pose), hands).values).toBeNull();
  });

  it.each([
    ['NotAllowedError', 'camera_denied'],
    ['SecurityError', 'camera_denied'],
    ['NotFoundError', 'no_camera'],
    ['OverconstrainedError', 'no_camera'],
    ['NotReadableError', 'camera_in_use'],
    ['Weird', 'no_camera'],
  ])('maps %s to %s', (name, code) => {
    expect(cameraErrorCode({ name })).toBe(code);
  });

  it('chooses SIMD or fallback WASM', () => {
    expect(wasmFiles(true)).toEqual({ loader: 'vision_wasm_internal.js', binary: 'vision_wasm_internal.wasm' });
    expect(wasmFiles(false).binary).toBe('vision_wasm_nosimd_internal.wasm');
  });

  it('measures frame rate and inference time', () => {
    const meter = new FrameMeter();
    for (let i = 0; i <= 10; i++) meter.record(i * 100, 20);
    expect(meter.fps).toBeCloseTo(10, 5);
    expect(meter.inferenceMs).toBe(20);
  });
});

describe('engine assets and config', () => {
  it('prefers same-origin files on the web and falls back to the pinned CDN', () => {
    const web = engineAssetSources('web', 'http://localhost:8081');
    expect(web[0]).toEqual({
      wasmBase: 'http://localhost:8081/mediapipe/wasm/',
      handModelUrl: 'http://localhost:8081/mediapipe/hand_landmarker.task',
      poseModelUrl: 'http://localhost:8081/mediapipe/pose_landmarker_lite.task',
    });
    expect(web.at(-1)).toEqual(remoteSource());
    expect(engineAssetSources('android')).toEqual([remoteSource()]);
  });

  it('pins the CDN to the installed MediaPipe version', () => {
    // Exact version pinned in package.json (no range), so the CDN always matches the bundled code.
    const version = appPackage.devDependencies['@mediapipe/tasks-vision'];
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.tasksVisionVersion).toBe(version);
    expect(remoteSource().wasmBase).toContain(`@${version}/`);
    expect(remoteSource().handModelUrl).not.toContain('latest');
  });

  it('checks models by role so a swapped file is rejected', () => {
    const hashes = engineHashes();
    expect(hashes[HAND_MODEL_KEY]).toBe(manifest.models.hand.sha256);
    expect(hashes[POSE_MODEL_KEY]).toBe(manifest.models.pose.sha256);
    expect(hashes['vision_wasm_internal.wasm']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('embeds the configuration safely in the engine page', () => {
    const config = engineConfig({ facing: 'front', active: true, platform: 'ios' });
    config.sources[0]!.wasmBase = 'https://x/</script><script>alert(1)//';
    const html = buildEngineHtml(config);
    expect(html).not.toContain('/*ENGINE_CONFIG*/');
    expect(html).toContain('window.__ISL_ENGINE_CONFIG__={"facing":"front"');
    expect(html).not.toContain('</script><script>alert(1)');
    expect(html.match(/<\/script>/g)).toHaveLength(2);
  });
});

describe('EngineFrameSource', () => {
  it('forwards frames only while the session listens', () => {
    const source = new EngineFrameSource();
    const received: (Float32Array | null)[] = [];
    source.push(1, [1, 2]);
    source.start((frame) => received.push(frame.values));
    source.push(2, [0.5, 0.25]);
    source.push(3, null);
    source.stop();
    source.push(4, [9]);
    expect(received).toEqual([Float32Array.from([0.5, 0.25]), null]);
    expect(source.simulated).toBe(false);
  });
});
