/**
 * Chooses when the app shows a sign for a trained model (its stabilizer
 * settings), on held-out recordings, with the app's own recognition session.
 * Bundled and run by scripts/tune-model.mjs, which reads and writes the files.
 *
 * Each recording is played at 15 fps into a session like Sign → Text's (window,
 * stride, rest before and after, as scripts/eval-sign-pack.mjs does). The
 * model's predictions are computed once per recording and replayed under every
 * setting in a grid. The chosen setting shows the right sign most often while
 * keeping wrong signs at or below --max-wrong.
 */
import { ModelSignRecognizer } from '@/model/ModelSignRecognizer';
import { parseModelPack, type ModelStabilizerSettings } from '@/model/modelPack';
import { decodeSpecFrames } from '@/personal/codec';
import { SAMPLE_FPS } from '@/personal/sample';
import { isEmergencyLabel, modelSessionConfig, stabilizerConfigFor } from '@/recognition/engine';
import { RecognitionSession } from '@/recognition/session';
import { PredictionStabilizer } from '@/recognition/stabilizer';
import type { FrameSource, LandmarkFrame, RawPrediction, SignRecognizer } from '@/recognition/types';

export interface Row {
  text: string;
  group?: string | null;
  recording: { frames: number; dim: number; data: string; missing?: number[] };
}

export interface Outcome extends ModelStabilizerSettings {
  correct: number;
  wrong: number;
  notSure: number;
  /**
   * Right sign shown, or (segment mode) offered for one tap: among the
   * suggestions when not sure, or the alternatives under a wrong sign.
   */
  correctOrSuggested: number;
}

const REST_BEFORE_FRAMES = 2 * SAMPLE_FPS;
const REST_AFTER_FRAMES = Math.round(1.5 * SAMPLE_FPS);

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'sign';

/** Per sign, as ml/scripts/train_from_landmarks.py: last group test, the one before validation. */
export function splitOf(rows: readonly Row[]): (row: Row) => 'train' | 'val' | 'test' {
  const groups = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = groups.get(r.text) ?? new Set<string>();
    set.add(String(r.group ?? 'all'));
    groups.set(r.text, set);
  }
  return (row) => {
    const ordered = [...groups.get(row.text)!].sort();
    const i = ordered.indexOf(String(row.group ?? 'all'));
    if (ordered.length >= 2 && i === ordered.length - 1) return 'test';
    if (ordered.length >= 3 && i === ordered.length - 2) return 'val';
    return 'train';
  };
}

class ManualSource implements FrameSource {
  readonly simulated = false;
  private handler: ((frame: LandmarkFrame) => void) | null = null;
  start(onFrame: (frame: LandmarkFrame) => void) {
    this.handler = onFrame;
  }
  stop() {
    this.handler = null;
  }
  push(frame: LandmarkFrame) {
    this.handler?.(frame);
  }
}

/** Lets pending predictions finish before the next frame (setImmediate in Node). */
export type NextTask = () => Promise<void>;

async function play(
  frames: (Float32Array | null)[],
  recognizer: SignRecognizer,
  settings: ModelStabilizerSettings | null,
  nextTask: NextTask,
): Promise<{ shown: string[]; suggested: string[] }> {
  const source = new ManualSource();
  const info = { ...recognizer.info, stabilizer: settings };
  const session = new RecognitionSession({
    source,
    recognizer,
    stabilizer: new PredictionStabilizer({ isEmergency: isEmergencyLabel, calibrated: info.calibrated, config: stabilizerConfigFor(info) }),
    config: modelSessionConfig(info),
  });
  const shown: string[] = [];
  let suggested: string[] = [];
  session.subscribe({
    onRecognition: (r) => shown.push(r.label),
    onSnapshot: (s) => {
      if (s.suggestions?.length) suggested = s.suggestions;
    },
  });
  await session.start();
  const held = (count: number, frame: Float32Array | null | undefined) => Array.from({ length: count }, () => frame ?? null);
  let t = 0;
  for (const values of [...held(REST_BEFORE_FRAMES, frames[0]), ...frames, ...held(REST_AFTER_FRAMES, frames.at(-1))]) {
    source.push({ timestampMs: t, values });
    t += 1000 / SAMPLE_FPS;
    await nextTask();
  }
  session.stop();
  return { shown, suggested };
}

export function grid(mode: 'window' | 'segment' = 'window'): ModelStabilizerSettings[] {
  const out: ModelStabilizerSettings[] = [];
  if (mode === 'segment') {
    // One prediction per sign: only the confidence and the lead over the runner-up matter.
    for (const minConfidence of [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9])
      for (const minMargin of [0, 0.05, 0.1, 0.15, 0.2, 0.3]) if (minMargin < minConfidence) out.push({ minConfidence, minMargin, minStablePredictions: 1 });
    return out;
  }
  for (const minConfidence of [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95])
    for (const minMargin of [0.15, 0.3, 0.5])
      for (const minStablePredictions of [3, 4, 5, 6, 8]) if (minMargin < minConfidence) out.push({ minConfidence, minMargin, minStablePredictions });
  return out;
}

/** The setting with the most right signs among those with few enough wrong ones (fewest wrong on ties). */
export function choose(outcomes: readonly Outcome[], maxWrong: number): Outcome | null {
  const allowed = outcomes.filter((o) => o.wrong <= maxWrong);
  allowed.sort((a, b) => b.correct - a.correct || a.wrong - b.wrong || b.minConfidence - a.minConfidence);
  return allowed[0] ?? null;
}

/** What happened to one recording under a setting. */
export interface RecordingOutcome {
  text: string;
  verdict: 'correct' | 'wrong' | 'not sure';
  /** Not shown, but offered for one tap (suggestions, or alternatives under a wrong sign). */
  suggested: boolean;
}

export interface TuneResult {
  /** Held-out recordings used, and how many signs they show. */
  recordings: number;
  signs: number;
  outcomes: Outcome[];
  /** The app's default settings, for comparison. */
  defaults: Outcome | undefined;
  chosen: Outcome | null;
  /** Per recording, under the chosen setting. */
  details: RecordingOutcome[];
}

export async function tune(options: {
  pack: unknown;
  rows: readonly Row[];
  split: 'val' | 'test' | 'all';
  maxWrong: number;
  nextTask: NextTask;
  progress?: (done: number, total: number) => void;
  /** Evaluate this setting only (e.g. the pack's own, chosen on other recordings) instead of choosing one. */
  fixed?: ModelStabilizerSettings;
}): Promise<TuneResult> {
  const pack = parseModelPack(options.pack);
  const split = splitOf(options.rows);
  const cases = options.rows.filter((r) => options.split === 'all' || split(r) === options.split);
  if (cases.length === 0) throw new Error(`no ${options.split} recordings`);

  const model = new ModelSignRecognizer(pack);
  await model.load();
  const recordings = cases.map((r) => {
    const missing = new Set(r.recording.missing ?? []);
    return decodeSpecFrames(r.recording.data, r.recording.frames, r.recording.dim).map((v, i) => (missing.has(i) ? null : v));
  });
  const logs: RawPrediction[][] = [];
  for (const [i, frames] of recordings.entries()) {
    const log: RawPrediction[] = [];
    const recorder: SignRecognizer = {
      info: model.info,
      load: async () => undefined,
      dispose: () => undefined,
      predict: async (window) => {
        const prediction = await model.predict(window);
        log.push(prediction);
        return prediction;
      },
    };
    await play(frames, recorder, null, options.nextTask);
    logs.push(log);
    options.progress?.(i + 1, recordings.length);
  }

  const outcomes: Outcome[] = [];
  const details = new Map<Outcome, RecordingOutcome[]>();
  for (const settings of options.fixed ? [options.fixed] : grid(pack.mode)) {
    let correct = 0;
    let wrong = 0;
    let suggestedRight = 0;
    const perRecording: RecordingOutcome[] = [];
    for (const [i, frames] of recordings.entries()) {
      const log = logs[i]!;
      let k = 0;
      const replay: SignRecognizer = {
        info: model.info,
        load: async () => undefined,
        dispose: () => undefined,
        predict: async () => log[Math.min(k++, log.length - 1)]!,
      };
      const { shown, suggested } = await play(frames, replay, settings, options.nextTask);
      const label = `${pack.id}:${slug(cases[i]!.text)}`;
      // As scripts/eval-sign-pack.mjs: the first sign shown decides.
      const verdict = shown[0] === label ? 'correct' : shown.length > 0 ? 'wrong' : 'not sure';
      const offered = verdict !== 'correct' && suggested.includes(label);
      if (verdict === 'correct') correct += 1;
      else if (verdict === 'wrong') wrong += 1;
      if (offered) suggestedRight += 1;
      perRecording.push({ text: cases[i]!.text, verdict, suggested: offered });
    }
    const n = recordings.length;
    const outcome: Outcome = {
      ...settings,
      correct: correct / n,
      wrong: wrong / n,
      notSure: (n - correct - wrong) / n,
      correctOrSuggested: (correct + suggestedRight) / n,
    };
    outcomes.push(outcome);
    details.set(outcome, perRecording);
  }
  const chosen = options.fixed ? outcomes[0]! : choose(outcomes, options.maxWrong);
  return {
    recordings: cases.length,
    signs: new Set(cases.map((c) => c.text)).size,
    outcomes,
    defaults: outcomes.find((o) => o.minConfidence === 0.7 && o.minMargin === 0.15 && o.minStablePredictions === 4),
    chosen,
    details: chosen ? details.get(chosen)! : [],
  };
}
