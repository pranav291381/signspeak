import * as Haptics from 'expo-haptics';
import { AccessibilityInfo } from 'react-native';

/** Screen-reader announcement for results that appear without user action. */
export function announce(message: string): void {
  AccessibilityInfo.announceForAccessibility(message);
}

/** Non-audio, non-visual confirmation. Failures are ignored (not all devices vibrate). */
export function confirmHaptic(enabled: boolean): void {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
