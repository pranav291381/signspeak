import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type PillTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'overlay';

interface Props {
  label: string;
  tone?: PillTone;
  icon?: IconName;
  testID?: string;
}

/** Small status label. */
export function Pill({ label, tone = 'neutral', icon, testID }: Props) {
  const { colors, radii } = useTheme();
  const palette = {
    neutral: { bg: colors.surfaceAlt, fg: colors.textSecondary },
    primary: { bg: colors.primaryContainer, fg: colors.onPrimaryContainer },
    success: { bg: colors.successBackground, fg: colors.success },
    warning: { bg: colors.warningBackground, fg: colors.warning },
    danger: { bg: colors.dangerBackground, fg: colors.danger },
    overlay: { bg: colors.scrim, fg: colors.onScrim },
  }[tone];
  return (
    <View testID={testID} style={[styles.pill, { backgroundColor: palette.bg, borderRadius: radii.pill }]}>
      {icon ? <Icon name={icon} size={14} color={palette.fg} /> : null}
      <AppText variant="label" style={{ color: palette.fg, fontSize: 13, lineHeight: 18 }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
});
