import fixture from '../../../../shared/fixtures/model_parity_v1.json';
import { decodeTensor, ModelPackError, parseModelPack } from '../modelPack';
import { softmax, TemporalModel } from '../temporalModel';

const clone = () => JSON.parse(JSON.stringify(fixture.pack));

function inputFrames(): Float32Array[] {
  const flat = decodeTensor(fixture.input);
  const [steps, dim] = fixture.input.shape as [number, number];
  return Array.from({ length: steps }, (_, t) => flat.slice(t * dim, (t + 1) * dim));
}

describe('TemporalModel', () => {
  it('gives the same logits as PyTorch', () => {
    const model = new TemporalModel(parseModelPack(clone()));
    const logits = model.forward(inputFrames());
    fixture.logits.forEach((expected, i) => expect(logits[i]).toBeCloseTo(expected, 4));
  });

  it('gives finite scores when nobody is in view', () => {
    const model = new TemporalModel(parseModelPack(clone()));
    const logits = model.forward(Array.from({ length: 8 }, () => new Float32Array(156)));
    expect(Array.from(logits).every(Number.isFinite)).toBe(true);
  });

  it('turns logits into probabilities, softened by the temperature', () => {
    const sharp = softmax([2, 0, 0], 1);
    const soft = softmax([2, 0, 0], 3);
    expect(sharp.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(soft[0]).toBeLessThan(sharp[0]!);
  });
});

describe('parseModelPack', () => {
  it('accepts the exported pack', () => {
    const pack = parseModelPack(clone());
    expect(pack.labels.map((l) => l.id)).toEqual(['__unknown__', 'test:1', 'test:2', 'test:3']);
    expect(pack.unknownLabel).toBe('__unknown__');
    expect(pack.calibrated).toBe(false);
  });

  it.each([
    ['another format', (p: Record<string, unknown>) => (p.format = 'x'), 'Not a model pack'],
    ['another architecture', (p: Record<string, unknown>) => (p.architecture = 'transformer'), 'Unknown model architecture'],
    ['another window', (p: Record<string, unknown>) => (p.windowFrames = 16), 'other landmark features'],
    ['labels that do not fit', (p: Record<string, unknown>) => (p.labels = [{ id: 'a', text: 'A' }]), 'labels do not match'],
    ['no source', (p: Record<string, unknown>) => (p.source = {}), 'training data comes from'],
    ['a bad temperature', (p: Record<string, unknown>) => (p.temperature = 0), 'Temperature'],
    [
      'a weight of the wrong shape',
      (p: { weights: Record<string, { shape: number[] }> }) => (p.weights['head.bias']!.shape = [9]),
      'head.bias',
    ],
  ])('rejects a pack with %s', (_, change, message) => {
    const pack = clone();
    (change as (p: unknown) => void)(pack);
    expect(() => parseModelPack(pack)).toThrow(ModelPackError);
    expect(() => parseModelPack(pack)).toThrow(message);
  });
});
