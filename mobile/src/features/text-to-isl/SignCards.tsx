import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText, Icon, Pill, PressableScale } from '@/components';
import { MotionPlayer } from '@/diagram/MotionPlayer';
import { SignStill } from '@/diagram/SignStill';
import { stillViewBox } from '@/diagram/still';
import type { MotionClip } from '@/diagram/timeline';
import { useTheme } from '@/theme';

import type { PlannedItem } from './plan';
import { choiceOf } from './SentencePlayer';

interface Props {
  items: PlannedItem[];
  chosen: number[];
  /** The card playing its sign, if any. */
  active: number | null;
  /** Play or stop this card's sign. */
  onToggle: (index: number) => void;
  /** Show the item's next recorded version. */
  onNextChoice: (index: number) => void;
  categoryLabel: (category: string) => string;
  testID?: string;
}

function CardPicture({ clip, playing, name }: { clip: MotionClip; playing: boolean; name: string }) {
  const { t } = useTranslation();
  const viewBox = useMemo(() => stillViewBox(clip), [clip]);
  const clips = useMemo(() => [clip], [clip]);
  return playing ? (
    <MotionPlayer clips={clips} playing loop viewBox={viewBox} accessibilityLabel={t('diagram.motionA11y', { text: name })} />
  ) : (
    <SignStill clip={clip} viewBox={viewBox} accessibilityLabel={t('diagram.a11y', { text: name })} />
  );
}

/**
 * Every sign in the sentence as a still diagram (start faded, end solid, the
 * hands' paths as arrows), to study at your own pace. Tapping one plays it
 * there, over and over, until tapped again.
 */
export function SignCards({ items, chosen, active, onToggle, onNextChoice, categoryLabel, testID }: Props) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  return (
    <View testID={testID} style={[styles.grid, { gap: spacing.sm }]}>
      {items.map((item, index) => {
        const choice = choiceOf(item, chosen[index] ?? 0);
        if (!choice) return null;
        const versions = item.choices.length;
        const playing = active === index;
        return (
          <View key={item.key} style={styles.cell}>
            <PressableScale
              testID={`sign-card-${index}`}
              accessibilityRole="button"
              accessibilityLabel={t(playing ? 'textToIsl.stopSign' : 'textToIsl.playSign', { text: choice.name })}
              accessibilityState={{ selected: playing }}
              onPress={() => onToggle(index)}
              pressedScale={0.97}
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: playing ? colors.primary : colors.border, borderRadius: radii.lg },
              ]}
            >
              <View style={{ backgroundColor: colors.surfaceAlt, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg }}>
                <CardPicture clip={choice.clip} playing={playing} name={choice.name} />
                <View style={[styles.badge, { backgroundColor: playing ? colors.primary : colors.scrim, borderRadius: radii.pill }]}>
                  <Icon name={playing ? 'pause' : 'play'} size={16} color={playing ? colors.onPrimary : colors.onScrim} />
                </View>
              </View>
              <View style={{ padding: spacing.sm, gap: 4 }}>
                <AppText variant="bodyStrong" numberOfLines={2}>
                  {choice.name}
                </AppText>
                <View style={styles.pills}>
                  {choice.source === 'personal' ? <Pill label={t('textToIsl.yourRecording')} tone="primary" icon="account" /> : null}
                  {choice.category ? <Pill label={categoryLabel(choice.category)} /> : null}
                </View>
              </View>
            </PressableScale>
            {versions > 1 ? (
              <PressableScale
                testID={`sign-card-${index}-other`}
                accessibilityRole="button"
                onPress={() => onNextChoice(index)}
                style={[styles.other, { borderRadius: radii.pill, backgroundColor: colors.primaryContainer }]}
              >
                <AppText variant="caption" style={{ color: colors.onPrimaryContainer }}>
                  {t('textToIsl.otherVersion', { index: ((chosen[index] ?? 0) % versions) + 1, count: versions })}
                </AppText>
              </PressableScale>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { flexBasis: '47%', flexGrow: 1, maxWidth: '50%', gap: 6 },
  card: { borderWidth: 1.5, overflow: 'hidden' },
  badge: { position: 'absolute', right: 8, bottom: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  other: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
});
