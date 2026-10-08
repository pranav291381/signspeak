import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Icon, PressableScale } from '@/components';
import { SignDiagram } from '@/diagram/SignDiagram';
import { sampleFrames } from '@/personal/store';
import type { PersonalSign } from '@/personal/types';
import { useTheme } from '@/theme';

interface Props {
  letter: string;
  sign: PersonalSign | undefined;
  onPress: () => void;
}

/** One letter of the alphabet map: its recorded handshape, or an invitation to record it. */
export const LetterTile = memo(function LetterTile({ letter, sign, onPress }: Props) {
  const { t } = useTranslation();
  const { colors, radii } = useTheme();
  const upper = letter.toUpperCase();
  const frames = useMemo(() => {
    const sample = sign?.samples[0];
    if (!sample) return null;
    try {
      return sampleFrames(sample);
    } catch {
      return null;
    }
  }, [sign]);

  return (
    <PressableScale
      testID={`letter-${letter}`}
      accessibilityRole="button"
      accessibilityLabel={
        frames ? t('signs.alphabet.recordedA11y', { letter: upper }) : t('signs.alphabet.missingA11y', { letter: upper })
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          borderRadius: radii.md,
          backgroundColor: frames ? colors.surface : colors.surfaceAlt,
          borderColor: frames ? colors.border : colors.outline,
          borderStyle: frames ? 'solid' : 'dashed',
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={styles.diagram} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {frames ? (
          <SignDiagram frames={frames} focus="hands" playing={false} accessibilityLabel="" />
        ) : (
          <Icon name="plus" size={16} color={colors.textSecondary} />
        )}
      </View>
      <AppText variant="heading" style={styles.letter}>
        {upper}
      </AppText>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  tile: {
    width: '22%',
    flexGrow: 1,
    maxWidth: '25%',
    aspectRatio: 0.82,
    borderWidth: 1,
    padding: 4,
    alignItems: 'center',
  },
  diagram: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  letter: { textAlign: 'center' },
});
