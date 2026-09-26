import * as Speech from 'expo-speech';

import type { SpeechEngine } from './SpeechService';

/**
 * Platform text-to-speech via expo-speech. iOS synthesizes on device; on Android
 * the installed TTS engine decides (some voices may use the network; see
 * docs/privacy.md).
 */
export const expoSpeechEngine: SpeechEngine = {
  speak(text, { language, rate, onDone, onStopped, onError }) {
    Speech.speak(text, { language, rate, onDone, onStopped, onError });
  },
  stop: () => Speech.stop(),
  getVoices: () => Speech.getAvailableVoicesAsync(),
};
