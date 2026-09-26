import { SpeechService, type EngineVoice, type SpeechEngine } from '../SpeechService';

type Outcome = 'done' | 'stopped' | 'error' | 'throw';

function fakeEngine(voices: EngineVoice[] | Error, outcome: Outcome = 'done') {
  const calls: { text: string; language: string; rate: number }[] = [];
  const engine: SpeechEngine = {
    speak(text, options) {
      if (outcome === 'throw') throw new Error('native module missing');
      calls.push({ text, language: options.language, rate: options.rate });
      if (outcome === 'done') options.onDone();
      if (outcome === 'stopped') options.onStopped();
      if (outcome === 'error') options.onError(new Error('tts failed'));
    },
    stop: jest.fn(() => Promise.resolve()),
    getVoices: jest.fn(() => (voices instanceof Error ? Promise.reject(voices) : Promise.resolve(voices))),
  };
  return { engine, calls };
}

const VOICES = [{ language: 'en-IN' }, { language: 'hi_IN' }];

describe('SpeechService', () => {
  it('speaks with the Indian-region voice tag and requested rate', async () => {
    const { engine, calls } = fakeEngine(VOICES);
    await expect(new SpeechService(engine).speak('  नमस्ते ', 'hi', 0.75)).resolves.toEqual({ status: 'ok' });
    expect(calls).toEqual([{ text: 'नमस्ते', language: 'hi-IN', rate: 0.75 }]);
  });

  it('refuses to speak with the wrong voice when the language is not installed', async () => {
    const { engine, calls } = fakeEngine(VOICES);
    await expect(new SpeechService(engine).speak('வணக்கம்', 'ta')).resolves.toEqual({ status: 'unsupported_language' });
    expect(calls).toEqual([]);
  });

  it('does not speak empty text', async () => {
    const { engine, calls } = fakeEngine(VOICES);
    await expect(new SpeechService(engine).speak('   ', 'en')).resolves.toEqual({ status: 'empty_text' });
    expect(calls).toEqual([]);
  });

  it('tries anyway when the device does not list voices, and reports an unavailable engine on failure', async () => {
    const ok = fakeEngine([]);
    await expect(new SpeechService(ok.engine).speak('Hello', 'en')).resolves.toEqual({ status: 'ok' });
    const failing = fakeEngine(new Error('no engine'), 'error');
    await expect(new SpeechService(failing.engine).speak('Hello', 'en')).resolves.toEqual({
      status: 'engine_unavailable',
    });
  });

  it('reports engine errors when the language is supported', async () => {
    const { engine } = fakeEngine(VOICES, 'error');
    await expect(new SpeechService(engine).speak('Hello', 'en')).resolves.toEqual({
      status: 'error',
      message: 'tts failed',
    });
  });

  it('reports an unavailable engine when the native module throws', async () => {
    const { engine } = fakeEngine(VOICES, 'throw');
    await expect(new SpeechService(engine).speak('Hello', 'en')).resolves.toEqual({ status: 'engine_unavailable' });
  });

  it('reports when speech was stopped', async () => {
    const { engine } = fakeEngine(VOICES, 'stopped');
    await expect(new SpeechService(engine).speak('Hello', 'en')).resolves.toEqual({ status: 'stopped' });
  });

  it('caches the voice list until refreshed', async () => {
    const { engine } = fakeEngine(VOICES);
    const service = new SpeechService(engine);
    await service.isLanguageSupported('en');
    await service.isLanguageSupported('hi');
    expect(engine.getVoices).toHaveBeenCalledTimes(1);
    service.refreshVoices();
    await service.isLanguageSupported('hi');
    expect(engine.getVoices).toHaveBeenCalledTimes(2);
  });
});
