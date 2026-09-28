import fixture from '../../../../shared/fixtures/model_parity_v1.json';
import segmentFixture from '../../../../shared/fixtures/segment_parity_v2.json';
import { ModelSignRecognizer } from '@/model/ModelSignRecognizer';
import { parseModelPack } from '@/model/modelPack';
import { SignModel } from '@/model/signModel';
import { MOTIONS, perform } from '@/test-utils/landmarks';

import { EngineSignModel } from '../../../engine/model';
import { EngineModelChannel } from '../EngineModelChannel';
import { decodeEngineMessage, decodeHostMessage, encodeMessage, type EngineToHost, type HostToEngine } from '../protocol';

const pack = () => parseModelPack(JSON.parse(JSON.stringify(fixture.pack)));

/** An engine page on the other side of the message boundary (encoded and decoded like the real one). */
function connect(channel: EngineModelChannel, page = new EngineSignModel()) {
  const sent: HostToEngine[] = [];
  let hold = false;
  const queued: EngineToHost[] = [];
  const deliver = (reply: EngineToHost) => {
    const decoded = decodeEngineMessage(encodeMessage(reply));
    if (decoded?.type === 'prediction') channel.receive(decoded);
  };
  channel.attach((message) => {
    const decoded = decodeHostMessage(encodeMessage(message))!;
    sent.push(decoded);
    if (decoded.type !== 'setModel' && decoded.type !== 'predict') return;
    const reply = page.handle(decoded);
    if (!reply) return;
    if (hold) queued.push(reply);
    else deliver(reply);
  });
  return {
    sent,
    page,
    hold: () => (hold = true),
    flush: () => queued.splice(0).forEach(deliver),
  };
}

const windowOf = (motion = MOTIONS.wave!) =>
  perform(motion, { durationMs: 2200 })
    .slice(-32)
    .map((f) => {
      const v = Float32Array.from(f.values!);
      for (let i = 2; i < 153; i += 3) v[i] = 0;
      return v;
    });

describe('EngineModelChannel + EngineSignModel', () => {
  it('runs the model in the engine page with the same result as in the app', async () => {
    const channel = new EngineModelChannel();
    const link = connect(channel);
    channel.load(pack());
    const frames = windowOf();
    const remote = await channel.forward(frames);
    const local = new SignModel(pack()).forward(frames);
    expect(remote).toHaveLength(local.length);
    // Frames travel rounded to 0.001, as the model's training data was.
    remote.forEach((value, i) => expect(value).toBeCloseTo(local[i]!, 2));
    expect(link.sent.filter((m) => m.type === 'setModel')).toHaveLength(1);
  });

  it('runs a whole-sign (segment) pack in the engine page too', async () => {
    const channel = new EngineModelChannel();
    connect(channel);
    const segmentPack = parseModelPack(JSON.parse(JSON.stringify(segmentFixture.pack)));
    channel.load(segmentPack);
    const sign = segmentFixture.frames.map((f) => Float32Array.from(f));
    const remote = await channel.forward(sign);
    const local = new SignModel(segmentPack).forward(sign);
    remote.forEach((value, i) => expect(value).toBeCloseTo(local[i]!, 2));
  });

  it('sends the pack once, and again to a new page', async () => {
    const channel = new EngineModelChannel();
    channel.load(pack());
    const first = connect(channel);
    await channel.forward(windowOf());
    await channel.forward(windowOf());
    expect(first.sent.map((m) => m.type)).toEqual(['setModel', 'predict', 'predict']);
    channel.detach();
    const second = connect(channel);
    await channel.forward(windowOf());
    expect(second.sent.map((m) => m.type)).toEqual(['setModel', 'predict']);
  });

  it('resends the pack when the page lost it (reloaded)', async () => {
    const channel = new EngineModelChannel();
    const link = connect(channel);
    channel.load(pack());
    link.page.handle({ type: 'setModel', pack: null });
    const logits = await channel.forward(windowOf());
    expect(logits).toHaveLength(4);
    expect(link.sent.map((m) => m.type)).toEqual(['setModel', 'predict', 'setModel', 'predict']);
  });

  it('fails a prediction when the pack cannot be read', async () => {
    const channel = new EngineModelChannel();
    const page = new EngineSignModel();
    connect(channel, page);
    channel.load(pack());
    page.handle({ type: 'setModel', pack: '{"format":"something else"}' });
    await expect(channel.forward(windowOf())).rejects.toThrow('could not run the model (failed)');
  });

  it('fails pending predictions when the page goes away, and times out', async () => {
    jest.useFakeTimers();
    try {
      const channel = new EngineModelChannel();
      const link = connect(channel);
      channel.load(pack());
      link.hold();
      const closed = channel.forward(windowOf());
      channel.detach();
      await expect(closed).rejects.toThrow('closed');
      await expect(channel.forward(windowOf())).rejects.toThrow('not ready');

      connect(channel).hold();
      const late = channel.forward(windowOf());
      jest.advanceTimersByTime(3000);
      await expect(late).rejects.toThrow('did not answer');
    } finally {
      jest.useRealTimers();
    }
  });

  it('is used by the recognizer once the page is attached', async () => {
    const channel = new EngineModelChannel();
    const recognizer = new ModelSignRecognizer(pack(), channel);
    await recognizer.load();
    const frames = perform(MOTIONS.wave!, { durationMs: 2200 });
    // Not attached yet: the app runs the model itself.
    const here = await recognizer.predict(frames);
    const link = connect(channel);
    const there = await recognizer.predict(frames);
    expect(link.sent.map((m) => m.type)).toEqual(['setModel', 'predict']);
    there.scores.forEach((s, i) => expect(s.score).toBeCloseTo(here.scores[i]!.score, 2));
  });

  it('only accepts well-formed model messages', () => {
    const decode = (payload: unknown) => decodeHostMessage(JSON.stringify({ tag: 'isl-engine', payload }));
    expect(decode({ type: 'setModel', pack: null })).toEqual({ type: 'setModel', pack: null });
    expect(decode({ type: 'setModel', pack: 3 })).toBeNull();
    expect(decode({ type: 'predict', id: 1, frames: 32, data: 'AAAA' })).toMatchObject({ type: 'predict', id: 1 });
    expect(decode({ type: 'predict', id: 1.5, frames: 32, data: 'AAAA' })).toBeNull();
    expect(decode({ type: 'predict', id: 1, frames: 0, data: 'AAAA' })).toBeNull();
    expect(decode({ type: 'predict', id: 1, frames: 32 })).toBeNull();
  });
});
