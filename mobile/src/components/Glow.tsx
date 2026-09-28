import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

interface Props {
  /** Height of the glowing area, from the top of its parent. */
  height?: number;
}

/**
 * A soft saffron light at the top of a screen, so every screen shares the
 * warmth of the logo. Decorative: drawn behind the content, never touched.
 */
export function Glow({ height = 420 }: Props) {
  const { colors, scheme } = useTheme();
  const strength = scheme === 'dark' ? 0.16 : 0.3;
  return (
    <View pointerEvents="none" style={[styles.glow, { height }]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="signspeak-glow" cx="88%" cy="0%" rx="85%" ry="80%" fx="88%" fy="0%">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={strength} />
            <Stop offset="0.55" stopColor={colors.accent} stopOpacity={strength * 0.28} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#signspeak-glow)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: { position: 'absolute', top: 0, left: 0, right: 0 },
});
