import { LANGUAGE_CODES, type LanguageCode } from '@/i18n/languages';
import { base64ToBytes } from '@/personal/codec';
import { FEATURE_SPEC_VERSION, FRAME_DIM, TARGET_FPS, WINDOW_FRAMES } from '@/recognition/featureSpec';

/**
 * A trained sign model for the app: configuration, labels, calibration and the
 * weights, written by ml/signspeak_ml/inference/app_export.py.
 */
export const MODEL_PACK_FORMAT = 'islconnect-model-pack';
export const MODEL_PACK_VERSION = 1;
export const MODEL_ARCHITECTURE = 'temporal-conv-bigru-v1';

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

export interface ModelPack {
  format: typeof MODEL_PACK_FORMAT;
  version: number;
  id: string;
  name: string;
  createdAt: string;
  featureSpecVersion: number;
  targetFps: number;
  windowFrames: number;
  architecture: string;
  config: ModelConfig;
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
  weights: Record<string, EncodedTensor>;
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
  if (value.version !== MODEL_PACK_VERSION) throw new ModelPackError(`Unsupported model pack version ${String(value.version)}`);
  if (value.architecture !== MODEL_ARCHITECTURE) throw new ModelPackError(`Unknown model architecture ${String(value.architecture)}`);
  if (value.featureSpecVersion !== FEATURE_SPEC_VERSION || value.targetFps !== TARGET_FPS || value.windowFrames !== WINDOW_FRAMES) {
    throw new ModelPackError('Model was made for other landmark features');
  }
  const { id, name, createdAt, config, labels, unknownLabel, temperature, calibrated, source, evaluation, weights } = value;
  const language = value.language ?? 'en';
  if (!LANGUAGE_CODES.includes(language as LanguageCode)) throw new ModelPackError('Model pack language is unknown');
  if (!isText(id) || !/^[a-z0-9-]+$/.test(id) || !isText(name) || !isText(createdAt)) throw new ModelPackError('Model pack header is incomplete');
  if (!isRecord(source) || !isText(source.name) || !isText(source.url) || !isText(source.permission)) {
    throw new ModelPackError('Model pack does not say where its training data comes from');
  }
  if (
    !isRecord(config) ||
    config.inputDim !== FRAME_DIM ||
    !positiveInt(config.convChannels) ||
    !positiveInt(config.kernelSize) ||
    config.kernelSize % 2 !== 1 ||
    !positiveInt(config.hiddenSize) ||
    !positiveInt(config.numClasses)
  ) {
    throw new ModelPackError('Model configuration is invalid');
  }
  const modelConfig = config as unknown as ModelConfig;
  if (
    !Array.isArray(labels) ||
    labels.length !== modelConfig.numClasses ||
    !labels.every((l) => isRecord(l) && isText(l.id) && typeof l.text === 'string') ||
    new Set(labels.map((l) => (l as ModelLabel).id)).size !== labels.length
  ) {
    throw new ModelPackError('Model labels do not match its classes');
  }
  if (unknownLabel !== null && !labels.some((l) => (l as ModelLabel).id === unknownLabel)) throw new ModelPackError('Unknown label is not a class');
  if (typeof temperature !== 'number' || !(temperature > 0.05 && temperature < 20)) throw new ModelPackError('Temperature is invalid');
  const stabilizer = parseStabilizer(value.stabilizer);
  if (!isRecord(weights)) throw new ModelPackError('Model pack has no weights');
  for (const [key, shape] of Object.entries(weightShapes(modelConfig))) {
    const tensor = weights[key];
    if (!isRecord(tensor) || !Array.isArray(tensor.shape) || tensor.shape.join(',') !== shape.join(',') || typeof tensor.data !== 'string') {
      throw new ModelPackError(`Weight ${key} is missing or has the wrong shape`);
    }
  }
  return {
    format: MODEL_PACK_FORMAT,
    version: MODEL_PACK_VERSION,
    id,
    name,
    createdAt,
    featureSpecVersion: FEATURE_SPEC_VERSION,
    targetFps: TARGET_FPS,
    windowFrames: WINDOW_FRAMES,
    architecture: MODEL_ARCHITECTURE,
    config: modelConfig,
    labels: labels as ModelLabel[],
    language: language as LanguageCode,
    unknownLabel: (unknownLabel as string | null) ?? null,
    temperature,
    calibrated: calibrated === true,
    stabilizer,
    source: { name: source.name, url: source.url, permission: source.permission },
    evaluation: isRecord(evaluation) ? evaluation : {},
    weights: weights as Record<string, EncodedTensor>,
  };
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
