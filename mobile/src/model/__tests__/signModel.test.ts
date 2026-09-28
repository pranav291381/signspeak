import fixture from '../../../../shared/fixtures/segment_parity_v2.json';
import { toXY } from '@/personal/codec';

import { ModelPackError, parseModelPack } from '../modelPack';
import { memberInput, resampleFrames, SignModel } from '../signModel';

const clone = () => JSON.parse(JSON.stringify(fixture.pack));
const frames = () => fixture.frames.map((f) => Float32Array.from(f));

describe('SignModel (segment packs)', () => {
  it('gives the same logits as PyTorch: both kinds of input, resampled and averaged', () => {
    const model = new SignModel(parseModelPack(clone()));
    const logits = model.forward(frames());
    fixture.logits.forEach((expected, i) => expect(logits[i]).toBeCloseTo(expected, 4));
  });

  it('resamples a sign of any length by linear interpolation', () => {
    const sign = [Float32Array.of(0, 10), Float32Array.of(2, 20), Float32Array.of(4, 40)];
    expect(resampleFrames(sign, 5).map((f) => Array.from(f))).toEqual([
      [0, 10],
      [1, 15],
      [2, 20],
      [3, 30],
      [4, 40],
    ]);
    expect(resampleFrames([Float32Array.of(7)], 3).map((f) => f[0])).toEqual([7, 7, 7]);
  });

  it('keeps the presence flags last in every kind of input', () => {
    const sign = frames().map(toXY);
    const rich = memberInput(sign, 'xy+hands+vel');
    expect(rich[0]).toHaveLength(105 + 84 + 102);
    expect(Array.from(rich[5]!.slice(-3))).toEqual(Array.from(sign[5]!.slice(-3)));
  });

  it('parses again as it was parsed: the app sends the parsed pack to the camera engine page', () => {
    const once = parseModelPack(clone());
    const twice = parseModelPack(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
    expect(new SignModel(twice).forward(frames())[0]).toBeCloseTo(fixture.logits[0]!, 4);
  });

  it('rejects segment packs whose members do not fit', () => {
    const wrongDim = clone();
    wrongDim.members[1].features = 'xy';
    expect(() => parseModelPack(wrongDim)).toThrow(ModelPackError);
    const noMembers = clone();
    noMembers.members = [];
    expect(() => parseModelPack(noMembers)).toThrow('no weights');
    const otherFrames = clone();
    otherFrames.windowFrames = 16;
    expect(() => parseModelPack(otherFrames)).toThrow('other landmark features');
  });
});
