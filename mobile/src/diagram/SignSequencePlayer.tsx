import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/useReduceMotion';
import { AppText, Button, Icon, IconButton, PressableScale } from '@/components';
import { useTheme } from '@/theme';

import { SignDiagram } from './SignDiagram';

export interface SequenceItem {
  key: string;
  /** Word or letter shown under the diagram. */
  caption: string;
  /** Recorded landmark frames, or null when nothing has been recorded for it. */
  frames: readonly ArrayLike<number>[] | null;
  /** Letters are shown close-up on the hands; words with the upper body. */
  kind: 'sign' | 'letter';
  /** Part of a fingerspelled word (shown grouped). */
  word?: string;
}

interface Props<T extends SequenceItem> {
  items: T[];
  /** Offer to record a missing item. */
  onRecordMissing?: (item: T) => void;
  testID?: string;
}

/** Pause on a missing item before moving on (ms). */
const MISSING_ITEM_MS = 1400;

/** Plays a sequence of sign diagrams one after another, with captions and controls. */
export function SignSequencePlayer<T extends SequenceItem>({ items, onRecordMissing, testID }: Props<T>) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const reduceMotion = useReduceMotion();
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(!reduceMotion);
  const [slow, setSlow] = useState(false);
  const current = items[Math.min(index, items.length - 1)];
  const atEnd = index >= items.length - 1;

  const advance = useCallback(() => {
    setIndex((i) => {
      if (i >= items.length - 1) {
        setPlaying(false);
        return i;
      }
      return i + 1;
    });
  }, [items.length]);

  // Missing recordings have no animation to wait for.
  useEffect(() => {
    if (!playing || !current || current.frames) return;
    const timer = setTimeout(advance, MISSING_ITEM_MS);
    return () => clearTimeout(timer);
  }, [playing, current, advance]);

  if (!current) return null;

  return (
    <View testID={testID} style={{ gap: spacing.md }}>
      <View style={[styles.stage, { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg }]}>
        {current.frames ? (
          <SignDiagram
            key={current.key}
            testID="sequence-diagram"
            frames={current.frames}
            focus={current.kind === 'letter' ? 'hands' : 'body'}
            playing={playing}
            speed={slow ? 0.5 : 1}
            onCycle={playing ? advance : undefined}
            accessibilityLabel={t('diagram.a11y', { text: current.caption })}
          />
        ) : (
          <View testID="sequence-missing" style={[styles.missing, { gap: spacing.sm, padding: spacing.lg }]}>
            <Icon name="hand-back-right-off-outline" size={40} color={colors.textSecondary} />
            <AppText variant="bodyStrong" style={styles.center}>
              {t('diagram.missingTitle', { text: current.caption })}
            </AppText>
            <AppText variant="caption" color="textSecondary" style={styles.center}>
              {t(current.kind === 'letter' ? 'diagram.missingLetter' : 'diagram.missingSign')}
            </AppText>
            {onRecordMissing ? (
              <Button
                size="sm"
                variant="secondary"
                icon="record-circle-outline"
                label={t('diagram.recordIt')}
                onPress={() => onRecordMissing(current)}
              />
            ) : null}
          </View>
        )}
        <View style={[styles.caption, { backgroundColor: colors.scrim, borderRadius: radii.pill }]}>
          <AppText variant="label" color="onScrim" testID="sequence-caption">
            {current.caption}
          </AppText>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
        {items.map((item, i) => {
          const selected = i === index;
          return (
            <PressableScale
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={t('diagram.jumpTo', { text: item.caption })}
              accessibilityState={{ selected }}
              onPress={() => setIndex(i)}
              style={[
                styles.chip,
                {
                  borderRadius: radii.pill,
                  backgroundColor: selected ? colors.primary : colors.surfaceAlt,
                  borderColor: item.frames ? 'transparent' : colors.outline,
                  borderStyle: item.frames ? 'solid' : 'dashed',
                },
              ]}
            >
              <AppText variant="label" style={{ color: selected ? colors.onPrimary : colors.text }}>
                {item.caption}
              </AppText>
            </PressableScale>
          );
        })}
      </ScrollView>

      <View style={[styles.controls, { gap: spacing.md }]}>
        <IconButton
          icon="skip-previous"
          accessibilityLabel={t('diagram.previous')}
          disabled={index === 0}
          onPress={() => setIndex((i) => Math.max(0, i - 1))}
        />
        <IconButton
          testID="sequence-play"
          variant="filled"
          size={60}
          icon={playing ? 'pause' : atEnd ? 'replay' : 'play'}
          accessibilityLabel={playing ? t('diagram.pause') : atEnd ? t('diagram.replay') : t('diagram.play')}
          onPress={() => {
            if (playing) {
              setPlaying(false);
              return;
            }
            if (atEnd) setIndex(0);
            setPlaying(true);
          }}
        />
        <IconButton
          icon="skip-next"
          accessibilityLabel={t('diagram.next')}
          disabled={atEnd}
          onPress={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
        />
        <IconButton
          icon="speedometer-slow"
          variant={slow ? 'filled' : 'tonal'}
          selected={slow}
          accessibilityLabel={t('diagram.slow')}
          onPress={() => setSlow((s) => !s)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', aspectRatio: 1, overflow: 'hidden', justifyContent: 'center' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  caption: { position: 'absolute', bottom: 12, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, minHeight: 40, justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
