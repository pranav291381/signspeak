import { LANGUAGE_CODES, type LanguageCode } from '@/i18n/languages';
import { base64ToBytes, XY_FRAME_DIM } from '@/personal/codec';
import { FEATURE_SPEC_VERSION, FRAME_DIM, TARGET_FPS, WINDOW_FRAMES } from '@/recognition/featureSpec';

/**
 * A trained sign model for the app: configuration, labels, calibration and the
 * weights, written by ml/signspeak_ml/inference/app_export.py.
 */
export const MODEL_PACK_FORMAT = 'islconnect-model-pack';
export const MODEL_PACK_VERSION = 1;
/** Version 2: whole-sign ("segment") models, possibly several averaged. */
export const SEGMENT_PACK_VERSION = 2;
export const MODEL_ARCHITECTURE = 'temporal-conv-bigru-v1';
/** Frames a whole sign is resampled to (segment packs). */
export const SEGMENT_FRAMES = 32;
/** The whole-sign transformer (segment packs only; see transformerModel.ts). */
export const SEGMENT_TRANSFORMER = 'segment-transformer-v1';

export interface ModelConfig {
  inputDim: number;
  convChannels: number;
  kernelSize: number;
  hiddenSize: number;
  numClasses: number;
}

export interface ModelLabel {
  id: string;
  /** What the sign means (empty for the unknown class). */
  text: string;
}

export interface EncodedTensor {
  shape: number[];
  /** Little-endian float32, base64. */
  data: string;
}

/**
 * When the app shows a sign, chosen for this model on held-out recordings
 * (scripts/tune-model.mjs): the averaged score must reach `minConfidence`,
 * lead the next sign by `minMargin`, and top `minStablePredictions`
 * predictions in a row. Stricter means fewer wrong signs and more "not sure".
 */
export interface ModelStabilizerSettings {
  minConfidence: number;
  minMargin: number;
  minStablePredictions: number;
}

/** What a member network reads per frame (see memberInput in signModel.ts). */
export type MemberFeatures = 'xy' | 'xy+hands+vel';
const MEMBER_INPUT_DIMS: Record<MemberFeatures, number> = { xy: XY_FRAME_DIM, 'xy+hands+vel': XY_FRAME_DIM + 84 + 102 };

export interface TransformerConfig {
  inputDim: number;
  /** Frames of a sign (SEGMENT_FRAMES). */
  frames: number;
  width: number;
  layers: number;
  heads: number;
  numClasses: number;
}

/**
 * One trained network; a segment pack averages the logits of all of its
 * members. `features`: what it reads per frame (segment packs; window packs
 * read spec-v1 frames).
 */
export type ModelMember =
  | { architecture: typeof MODEL_ARCHITECTURE; features: MemberFeatures; config: ModelConfig; weights: Record<string, EncodedTensor> }
  | { architecture: typeof SEGMENT_TRANSFORMER; features: MemberFeatures; config: TransformerConfig; weights: Record<string, EncodedTensor> };

export interface ModelPack {
  format: typeof MODEL_PACK_FORMAT;
  version: number;
  id: string;
  name: string;
  createdAt: string;
  featureSpecVersion: number;
  targetFps: number;
  windowFrames: number;
  /**
   * `window`: the model reads the last `windowFrames` frames, continuously.
   * `segment`: it reads a whole sign once it is finished, resampled to
   * `windowFrames` frames, as x/y without depth (see src/recognition/segmenter.ts).
   */
  mode: 'window' | 'segment';
  /** Window packs only, as stored (their one network is also `members[0]`). */
  architecture?: string;
  config?: ModelConfig;
  labels: ModelLabel[];
  /** Language of the labels' text. */
  language: LanguageCode;
  /** Id of the "none of these signs" class, if the model has one. */
  unknownLabel: string | null;
  /** Softmax temperature fitted on validation data. */
  temperature: number;
  /** True only if calibration was verified on held-out data. */
  calibrated: boolean;
  /** Settings for showing a sign; the app's defaults when absent. */
  stabilizer: ModelStabilizerSettings | null;
  source: { name: string; url: string; permission: string };
  evaluation: Record<string, unknown>;
  weights?: Record<string, EncodedTensor>;
  /** Every network in the pack. */
  members: ModelMember[];
}

export class ModelPackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelPackError';
  }
}

/** Expected shape of every weight, from the configuration. */
export function weightShapes(config: ModelConfig): Record<string, number[]> {
  const { inputDim: d, convChannels: c, kernelSize: k, hiddenSize: h, numClasses: n } = config;
  const shapes: Record<string, number[]> = {
    'input_norm.weight': [d],
    'input_norm.bias': [d],
    'conv1.weight': [c, d, k],
    'conv1.bias': [c],
    'conv2.weight': [c, c, k],
    'conv2.bias': [c],
    'attention.weight': [1, 2 * h],
    'attention.bias': [1],
    'head.weight': [n, 2 * h],
    'head.bias': [n],
  };
  for (const suffix of ['', '_reverse']) {
    shapes[`gru.weight_ih_l0${suffix}`] = [3 * h, c];
    shapes[`gru.weight_hh_l0${suffix}`] = [3 * h, h];
    shapes[`gru.bias_ih_l0${suffix}`] = [3 * h];
    shapes[`gru.bias_hh_l0${suffix}`] = [3 * h];
  }
  return shapes;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const positiveInt = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0;

/** Checks a model pack read from JSON; anything that does not fit this app is rejected. */
export function parseModelPack(value: unknown): ModelPack {
  if (!isRecord(value) || value.format !== MODEL_PACK_FORMAT) throw new ModelPackError('Not a model pack');
  if (value.version !== MODEL_PACK_VERSION && value.version !== SEGMENT_PACK_VERSION) {
    throw new ModelPackError(`Unsupported model pack version ${String(value.version)}`);
  }
  const segment = value.version === SEGMENT_PACK_VERSION;
  const frames = segment ? SEGMENT_FRAMES : WINDOW_FRAMES;
  if (value.featureSpecVersion !== FEATURE_SPEC_VERSION || value.targetFps !== TARGET_FPS || value.windowFrames !== frames) {
    throw new ModelPackError('Model was made for other landmark features');
  }
  if (segment && value.mode !== 'segment') throw new ModelPackError('Model was made for other landmark features');
  const { id, name, createdAt, labels, unknownLabel, temperature, calibrated, source, evaluation } = value;
  const rawMembers = segment ? value.members : [{ architecture: value.architecture, config: value.config, weights: value.weights }];
  if (!Array.isArray(rawMembers) || rawMembers.length === 0 || rawMembers.length > 8) throw new ModelPackError('Model pack has no weights');
  const language = value.language ?? 'en';
  if (!LANGUAGE_CODES.includes(language as LanguageCode)) throw new ModelPackError('Model pack language is unknown');
  if (!isText(id) || !/^[a-z0-9-]+$/.test(id) || !isText(name) || !isText(createdAt)) throw new ModelPackError('Model pack header is incomplete');
  if (!isRecord(source) || !isText(source.name) || !isText(source.url) || !isText(source.permission)) {
    throw new ModelPackError('Model pack does not say where its training data comes from');
  }
  const members = rawMembers.map((member) => parseMember(member, segment));
  const numClasses = members[0]!.config.numClasses;
  if (members.some((m) => m.config.numClasses !== numClasses)) throw new ModelPackError('Model configuration is invalid');
  if (
    !Array.isArray(labels) ||
    labels.length !== numClasses ||
    !labels.every((l) => isRecord(l) && isText(l.id) && typeof l.text === 'string') ||
    new Set(labels.map((l) => (l as ModelLabel).id)).size !== labels.length
  ) {
    throw new ModelPackError('Model labels do not match its classes');
  }
  if (unknownLabel !== null && !labels.some((l) => (l as ModelLabel).id === unknownLabel)) throw new ModelPackError('Unknown label is not a class');
  if (typeof temperature !== 'number' || !(temperature > 0.05 && temperature < 20)) throw new ModelPackError('Temperature is invalid');
  const stabilizer = parseStabilizer(value.stabilizer);
  return {
    format: MODEL_PACK_FORMAT,
    version: segment ? SEGMENT_PACK_VERSION : MODEL_PACK_VERSION,
    id,
    name,
    createdAt,
    featureSpecVersion: FEATURE_SPEC_VERSION,
    targetFps: TARGET_FPS,
    windowFrames: frames,
    mode: segment ? 'segment' : 'window',
    ...(segment ? {} : { architecture: MODEL_ARCHITECTURE, config: members[0]!.config as ModelConfig, weights: members[0]!.weights }),
    labels: labels as ModelLabel[],
    language: language as LanguageCode,
    unknownLabel: (unknownLabel as string | null) ?? null,
    temperature,
    calibrated: calibrated === true,
    stabilizer,
    source: { name: source.name, url: source.url, permission: source.permission },
    evaluation: isRecord(evaluation) ? evaluation : {},
    members,
  };
}

function checkWeights(weights: unknown, shapes: Record<string, number[]>): Record<string, EncodedTensor> {
  if (!isRecord(weights)) throw new ModelPackError('Model pack has no weights');
  for (const [key, shape] of Object.entries(shapes)) {
    const tensor = weights[key];
    if (!isRecord(tensor) || !Array.isArray(tensor.shape) || tensor.shape.join(',') !== shape.join(',') || typeof tensor.data !== 'string') {
      throw new ModelPackError(`Weight ${key} is missing or has the wrong shape`);
    }
  }
  return weights as Record<string, EncodedTensor>;
}

function parseMember(value: unknown, segment: boolean): ModelMember {
  if (!isRecord(value)) throw new ModelPackError('Model pack has no weights');
  const transformer = segment && value.architecture === SEGMENT_TRANSFORMER;
  if (value.architecture !== MODEL_ARCHITECTURE && !transformer) {
    throw new ModelPackError(`Unknown model architecture ${String(value.architecture)}`);
  }
  const { config, weights } = value;
  const features = segment ? (value.features ?? 'xy') : 'xy';
  if (features !== 'xy' && features !== 'xy+hands+vel') throw new ModelPackError('Model configuration is invalid');
  const inputDim = segment ? MEMBER_INPUT_DIMS[features] : FRAME_DIM;
  if (transformer) {
    if (
      !isRecord(config) ||
      config.inputDim !== inputDim ||
      config.frames !== SEGMENT_FRAMES ||
      !positiveInt(config.width) ||
      !positiveInt(config.layers) ||
      config.layers > 8 ||
      !positiveInt(config.heads) ||
      config.width % config.heads !== 0 ||
      !positiveInt(config.numClasses)
    ) {
      throw new ModelPackError('Model configuration is invalid');
    }
    const transformerConfig = config as unknown as TransformerConfig;
    return { architecture: SEGMENT_TRANSFORMER, features, config: transformerConfig, weights: checkWeights(weights, transformerWeightShapes(transformerConfig)) };
  }
  if (
    !isRecord(config) ||
    config.inputDim !== inputDim ||
    !positiveInt(config.convChannels) ||
    !positiveInt(config.kernelSize) ||
    config.kernelSize % 2 !== 1 ||
    !positiveInt(config.hiddenSize) ||
    !positiveInt(config.numClasses)
  ) {
    throw new ModelPackError('Model configuration is invalid');
  }
  const modelConfig = config as unknown as ModelConfig;
  return { architecture: MODEL_ARCHITECTURE, features, config: modelConfig, weights: checkWeights(weights, weightShapes(modelConfig)) };
}

function parseStabilizer(value: unknown): ModelStabilizerSettings | null {
  if (value === undefined || value === null) return null;
  const unit = (n: unknown): n is number => typeof n === 'number' && n >= 0 && n <= 1;
  if (
    !isRecord(value) ||
    !unit(value.minConfidence) ||
    !unit(value.minMargin) ||
    !positiveInt(value.minStablePredictions) ||
    value.minStablePredictions > 20
  ) {
    throw new ModelPackError('Model stabilizer settings are invalid');
  }
  return { minConfidence: value.minConfidence, minMargin: value.minMargin, minStablePredictions: value.minStablePredictions };
}

/** Expected shape of every weight, from the configuration. */
export function transformerWeightShapes(config: TransformerConfig): Record<string, number[]> {
  const { inputDim: d, frames, width: w, layers, numClasses: n } = config;
  const shapes: Record<string, number[]> = {
    'input_norm.weight': [d],
    'input_norm.bias': [d],
    'embed.weight': [w, d],
    'embed.bias': [w],
    position: [frames, w],
    'output_norm.weight': [w],
    'output_norm.bias': [w],
    'head.weight': [n, w],
    'head.bias': [n],
  };
  for (let i = 0; i < layers; i++) {
    const p = `layers.${i}.`;
    Object.assign(shapes, {
      [`${p}norm1.weight`]: [w],
      [`${p}norm1.bias`]: [w],
      [`${p}attention.in.weight`]: [3 * w, w],
      [`${p}attention.in.bias`]: [3 * w],
      [`${p}attention.out.weight`]: [w, w],
      [`${p}attention.out.bias`]: [w],
      [`${p}norm2.weight`]: [w],
      [`${p}norm2.bias`]: [w],
      [`${p}ff1.weight`]: [2 * w, w],
      [`${p}ff1.bias`]: [2 * w],
      [`${p}ff2.weight`]: [w, 2 * w],
      [`${p}ff2.bias`]: [w],
    });
  }
  return shapes;
}

/** Decodes one weight tensor (little-endian float32). */
export function decodeTensor(tensor: EncodedTensor): Float32Array {
  const bytes = base64ToBytes(tensor.data);
  const count = tensor.shape.reduce((a, b) => a * b, 1);
  if (bytes.length !== count * 4) throw new ModelPackError('Weight data does not match its shape');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}
