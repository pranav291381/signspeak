import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Last known value of the system setting. Asking the system is asynchronous, so
 * without this every new screen would start as "motion allowed" for a moment.
 */
let known: boolean | null = null;

/** Tracks the system "reduce motion" setting. */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(known ?? false);

  useEffect(() => {
    let mounted = true;
    const update = (enabled: boolean) => {
      known = enabled;
      if (mounted) setReduceMotion(enabled);
    };
    AccessibilityInfo.isReduceMotionEnabled()
      .then(update)
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
