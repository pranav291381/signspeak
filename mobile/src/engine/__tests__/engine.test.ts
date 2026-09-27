import fixture from '../../../../shared/fixtures/feature_parity_v1.json';
import appPackage from '../../../package.json';
import {
  cameraErrorCode,
  delegateOrder,
  DelegateTuner,
  FrameMeter,
  frameValues,
  isSoftwareRenderer,
  pickHands,
  shouldMirror,
  smoothPoints,
  wasmFiles,
} from '../../../engine/core';
import { engineAssetSources, engineHashes, HAND_MODEL_KEY, POSE_MODEL_KEY, remoteSource } from '../assets';
import { EngineFrameSource } from '../EngineFrameSource';
import { buildEngineHtml, engineConfig, engineContentSecurityPolicy } from '../engineHtml';
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
    expect(decodeHostMessage(encodeMessage({ type: 'flash', extra: 'ignored' }))).toEqual({ type: 'flash' });
    expect(decodeHostMessage(encodeMessage({ type: 'setReduceMotion', reduceMotion: true }))).toEqual({
      type: 'setReduceMotion',
      reduceMotion: true,
    });
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
    const { values } = frameValues(pts(both.pose), hands, 1);
    expect(values).toHaveLength(156);
    expect(values!.slice(153)).toEqual([1, 0, 1]);
    expect(values!.every((v) => Math.abs(v * 1e4 - Math.round(v * 1e4)) < 1e-6)).toBe(true);
    expect(frameValues(undefined, hands, 1)).toEqual({ values: null, hands: 1 });

    const degenerate = fixture.cases.find((c) => c.name === 'degenerate shoulders')!;
    expect(frameValues(pts(degenerate.pose), hands, 1).values).toBeNull();
  });

  it('gives the same numbers for the same person in a portrait or a landscape image', () => {
    const hands = (points: ReturnType<typeof pts>) => ({ landmarks: [points], handedness: [[{ categoryName: 'Right', score: 0.9 }]] });
    // The same scene in pixels, seen through a 1280×720 and a 720×1280 image
    // (MediaPipe gives x / width, y / height, and depth on the scale of x).
    const inImage = (points: ReturnType<typeof pts>, width: number, height: number) =>
      points.map((p) => ({ x: (p.x * 1000) / width, y: (p.y * 1000) / height, z: (p.z * 1000) / width }));
    const landscape = frameValues(inImage(pts(both.pose), 1280, 720), hands(inImage(hand, 1280, 720)), 720 / 1280).values!;
    const portrait = frameValues(inImage(pts(both.pose), 720, 1280), hands(inImage(hand, 720, 1280)), 1280 / 720).values!;
    landscape.forEach((v, i) => expect(portrait[i]).toBeCloseTo(v, 3));
    // Without the correction the two would disagree.
    const uncorrected = frameValues(inImage(pts(both.pose), 720, 1280), hands(inImage(hand, 720, 1280)), 1).values!;
    expect(uncorrected.some((v, i) => Math.abs(v - landscape[i]!) > 0.1)).toBe(true);
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

describe('engine speed and drawing helpers', () => {
  it('avoids the GPU path on software WebGL, where it is many times slower', () => {
    expect(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe(true);
    expect(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(isSoftwareRenderer('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)')).toBe(true);
    expect(isSoftwareRenderer(null)).toBe(true);
    expect(isSoftwareRenderer('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)')).toBe(false);
    expect(delegateOrder(true)).toEqual(['CPU']);
    expect(delegateOrder(false)).toEqual(['GPU', 'CPU']);
  });

  it('keeps a fast GPU, and moves to the CPU when the GPU is slow', () => {
    const fast = new DelegateTuner('GPU', ['GPU', 'CPU']);
    const decisions = Array.from({ length: DelegateTuner.SAMPLE }, () => fast.record(12));
    expect(decisions.filter(Boolean)).toEqual([]);
    expect(fast.settled).toBe(true);

    const slow = new DelegateTuner('GPU', ['GPU', 'CPU']);
    let switched: string | null = null;
    for (let i = 0; i < DelegateTuner.SAMPLE; i++) switched = slow.record(400) ?? switched;
    expect(switched).toBe('CPU');
    // The CPU turns out faster: stay there.
    const after = Array.from({ length: DelegateTuner.SAMPLE }, () => slow.record(60));
    expect(after.filter(Boolean)).toEqual([]);
    expect(slow.current).toBe('CPU');
  });

  it('goes back to the GPU if the CPU is even slower', () => {
    const tuner = new DelegateTuner('GPU', ['GPU', 'CPU']);
    for (let i = 0; i < DelegateTuner.SAMPLE; i++) tuner.record(80);
    let back: string | null = null;
    for (let i = 0; i < DelegateTuner.SAMPLE; i++) back = tuner.record(300) ?? back;
    expect(back).toBe('GPU');
    expect(tuner.settled).toBe(true);
  });

  it('mirrors cameras that face the user, including laptop webcams that do not say', () => {
    expect(shouldMirror('back', 'user', false)).toBe(true);
    expect(shouldMirror('front', 'environment', true)).toBe(false);
    expect(shouldMirror('back', undefined, true)).toBe(true);
    expect(shouldMirror('back', undefined, false)).toBe(false);
    expect(shouldMirror('front', undefined, false)).toBe(true);
  });

  it('eases drawn points toward the detection and snaps on big jumps', () => {
    const current = [{ x: 0.5, y: 0.5 }];
    expect(smoothPoints(current, [{ x: 0.6, y: 0.5 }], 0.5)[0]).toEqual({ x: 0.55, y: 0.5 });
    expect(smoothPoints(current, [{ x: 0.9, y: 0.5 }], 0.5)[0]).toEqual({ x: 0.9, y: 0.5 });
    expect(smoothPoints(null, [{ x: 0.1, y: 0.2 }], 0.5)).toEqual([{ x: 0.1, y: 0.2 }]);
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

  it('mirrors unknown cameras only on the web (laptop webcams)', () => {
    expect(engineConfig({ facing: 'back', active: true, platform: 'web' }).mirrorUnknown).toBe(true);
    expect(engineConfig({ facing: 'back', active: true, platform: 'android' }).mirrorUnknown).toBe(false);
    expect(engineConfig({ facing: 'back', active: true, platform: 'ios' }).targetFps).toBe(30);
  });

  it('passes the reduced-motion preference to the overlay', () => {
    expect(engineConfig({ facing: 'back', active: true, platform: 'ios' }).reduceMotion).toBe(false);
    expect(engineConfig({ facing: 'back', active: true, platform: 'ios', reduceMotion: true }).reduceMotion).toBe(true);
  });

  it('lets the engine connect only to the hosts that serve its files', () => {
    const phone = engineConfig({ facing: 'back', active: true, platform: 'android' });
    expect(engineContentSecurityPolicy(phone)).toBe(
      "connect-src 'self' blob: https://cdn.jsdelivr.net https://storage.googleapis.com",
    );
    const web = engineConfig({ facing: 'back', active: true, platform: 'web', origin: 'http://localhost:8081' });
    expect(engineContentSecurityPolicy(web)).toContain('http://localhost:8081');
    const html = buildEngineHtml(phone);
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${engineContentSecurityPolicy(phone)}">`);
    // MediaPipe's default usage logging host is not allowed.
    expect(html).not.toMatch(/connect-src[^"]*odml\.pa\.googleapis\.com/);
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
