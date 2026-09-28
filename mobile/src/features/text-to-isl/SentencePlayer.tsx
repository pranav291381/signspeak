import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useReduceMotion } from '@/accessibility/useReduceMotion';
import { AppText, Icon, IconButton, PressableScale, SegmentedControl } from '@/components';
import { MotionPlayer, nextSeekNonce, type SeekRequest } from '@/diagram/MotionPlayer';
import { SignStill } from '@/diagram/SignStill';
import { phraseOf } from '@/motion/words';
import { useTheme } from '@/theme';

import type { PlannedItem, SignChoice } from './plan';

const SPEEDS = ['0.5', '0.75', '1'] as const;
type Speed = (typeof SPEEDS)[number];

interface Props {
  items: PlannedItem[];
  /** The choice shown for each item (index into its `choices`). */
  chosen: number[];
  /** Hold still while something else plays (e.g. a sign card). */
  suspended?: boolean;
  testID?: string;
}

export function choiceOf(item: PlannedItem, chosen: number): SignChoice | null {
  return item.choices[chosen] ?? item.choices[0] ?? null;
}

/**
 * The typed words as one smooth movement, sign after sign, with the sign being
 * made named under it, the words as chips to jump between, and controls for
 * speed, mirroring and repeating.
 */
export function SentencePlayer({ items, chosen, suspended = false, testID }: Props) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const reduceMotion = useReduceMotion();
  // With "reduce motion" nothing moves until Play is pressed; until then the first sign is shown as a still diagram.
  const [started, setStarted] = useState(!reduceMotion);
  const [playing, setPlaying] = useState(!reduceMotion);
  const [speed, setSpeed] = useState<Speed>('1');
  const [mirror, setMirror] = useState(false);
  const [loop, setLoop] = useState(false);
  const [current, setCurrent] = useState(() => Math.max(0, items.findIndex((item) => item.kind !== 'missing')));
  const [seek, setSeek] = useState<SeekRequest | null>(null);
  const [missing, setMissing] = useState<PlannedItem | null>(null);
  const [atEnd, setAtEnd] = useState(false);

  const clips = useMemo(() => items.map((item, i) => choiceOf(item, chosen[i] ?? 0)?.clip ?? null), [items, chosen]);
  const playable = items.map((item, i) => (clips[i] ? i : -1)).filter((i) => i >= 0);

  const show = (index: number) => {
    setMissing(null);
    setAtEnd(false);
    setSeek({ item: index, nonce: nextSeekNonce() });
    setCurrent(index);
    setStarted(true);
    setPlaying(true);
  };

  const previous = playable.filter((i) => i < current).pop();
  const next = playable.find((i) => i > current);
  const item = items[current];
  const choice = item ? choiceOf(item, chosen[current] ?? 0) : null;
  const spelled = item?.kind === 'letter' && item.word ? item.word : null;
  const typedDiffers = item && choice && item.kind === 'sign' && phraseOf(choice.name) !== item.caption;

  if (playable.length === 0) return null;

  return (
    <View testID={testID} style={{ gap: spacing.md }}>
      <View style={[styles.header, { gap: spacing.sm }]}>
        <View style={styles.flex}>
          <AppText variant="title" testID="sentence-caption" numberOfLines={2}>
            {choice?.name ?? ''}
          </AppText>
          {typedDiffers || spelled ? (
            <AppText variant="caption" color="textSecondary">
              {spelled ? t('textToIsl.spelling', { text: spelled }) : t('textToIsl.forWord', { text: item!.caption })}
            </AppText>
          ) : null}
        </View>
        {playable.length > 1 ? (
          <AppText variant="caption" color="textSecondary" testID="sentence-position">
            {t('textToIsl.position', { index: playable.indexOf(current) + 1, count: playable.length })}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.stage, { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg }]}>
        {started ? (
          <MotionPlayer
            testID="sentence-motion"
            clips={clips}
            playing={playing && !suspended}
            speed={Number(speed)}
            mirror={mirror}
            loop={loop}
            seek={seek}
            showProgress
            onItem={(index) => {
              setCurrent(index);
            }}
            onEnd={() => {
              setPlaying(false);
              setAtEnd(true);
            }}
            accessibilityLabel={t('diagram.motionA11y', {
              text: items
                .map((entry, i) => (entry.kind === 'missing' ? null : (choiceOf(entry, chosen[i] ?? 0)?.name ?? entry.caption)))
                .filter(Boolean)
                .join(', '),
            })}
          />
        ) : (
          <SignStill
            testID="sentence-still"
            clip={clips[current] ?? clips[playable[0]!]!}
            mirror={mirror}
            accessibilityLabel={t('diagram.a11y', { text: choice?.name ?? '' })}
          />
        )}
        {mirror ? (
          <View pointerEvents="none" style={[styles.badge, { backgroundColor: colors.scrim, borderRadius: radii.pill }]}>
            <Icon name="flip-horizontal" size={14} color={colors.onScrim} />
            <AppText variant="caption" color="onScrim">
              {t('diagram.mirrored')}
            </AppText>
          </View>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={t('textToIsl.wordsLabel')}
        contentContainerStyle={{ gap: spacing.xs }}
      >
        {items.map((entry, i) => {
          const selected = i === current && entry.kind !== 'missing';
          const absent = entry.kind === 'missing';
          const label = absent ? entry.caption : (choiceOf(entry, chosen[i] ?? 0)?.name ?? entry.caption);
          return (
            <PressableScale
              key={entry.key}
              testID={`sentence-chip-${i}`}
              accessibilityRole="button"
              accessibilityLabel={absent ? t('textToIsl.noSignFor', { text: entry.caption }) : t('diagram.jumpTo', { text: label })}
              accessibilityState={{ selected }}
              onPress={() => (absent ? setMissing(entry) : show(i))}
              style={[
                styles.chip,
                {
                  borderRadius: radii.pill,
                  backgroundColor: selected ? colors.primary : absent ? 'transparent' : colors.surfaceAlt,
                  borderColor: absent ? colors.outline : 'transparent',
                  borderStyle: absent ? 'dashed' : 'solid',
                },
              ]}
            >
              {absent ? <Icon name="hand-back-right-off-outline" size={16} color={colors.textSecondary} /> : null}
              <AppText
                variant="label"
                style={{ color: selected ? colors.onPrimary : absent ? colors.textSecondary : colors.text }}
              >
                {label}
              </AppText>
            </PressableScale>
          );
        })}
      </ScrollView>

      {missing ? (
        <View
          testID="sentence-missing"
          style={[styles.missing, { borderColor: colors.outline, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm }]}
        >
          <AppText variant="bodyStrong">{t('textToIsl.noSignFor', { text: missing.caption })}</AppText>
          <AppText variant="caption" color="textSecondary">
            {t('textToIsl.noSignBody')}
          </AppText>
        </View>
      ) : null}

      <View style={[styles.row, { gap: spacing.md }]}>
        <IconButton
          icon="skip-previous"
          testID="sentence-previous"
          accessibilityLabel={t('diagram.previous')}
          onPress={() => show(previous ?? current)}
        />
        <IconButton
          testID="sentence-play"
          variant="filled"
          size={60}
          icon={playing && started ? 'pause' : atEnd ? 'replay' : 'play'}
          accessibilityLabel={playing && started ? t('diagram.pause') : atEnd ? t('diagram.replay') : t('diagram.play')}
          onPress={() => {
            if (atEnd) show(playable[0]!);
            else if (!started) show(current);
            else setPlaying((p) => !p);
          }}
        />
        <IconButton
          icon="skip-next"
          testID="sentence-next"
          accessibilityLabel={t('diagram.next')}
          disabled={next === undefined}
          onPress={() => next !== undefined && show(next)}
        />
      </View>

      <View style={[styles.row, { gap: spacing.sm }]}>
        <View style={styles.speed}>
          <SegmentedControl<Speed>
            testID="sentence-speed"
            label={t('diagram.speed')}
            value={speed}
            onChange={setSpeed}
            segments={SPEEDS.map((value) => ({ value, label: `${value}×` }))}
          />
        </View>
        <IconButton
          testID="sentence-mirror"
          icon="flip-horizontal"
          selected={mirror}
          variant={mirror ? 'filled' : 'tonal'}
          accessibilityLabel={t('diagram.mirror')}
          onPress={() => setMirror((m) => !m)}
        />
        <IconButton
          testID="sentence-loop"
          icon={loop ? 'repeat' : 'repeat-off'}
          selected={loop}
          variant={loop ? 'filled' : 'tonal'}
          accessibilityLabel={t('diagram.repeat')}
          onPress={() => setLoop((l) => !l)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'flex-end' },
  flex: { flex: 1 },
  badge: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, minHeight: 44 },
  missing: { borderWidth: 1, borderStyle: 'dashed' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  speed: { flex: 1 },
});
