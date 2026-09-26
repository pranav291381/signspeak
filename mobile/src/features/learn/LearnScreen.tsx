import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, Card, Icon, Notice, Pill, Screen, type IconName } from '@/components';
import { usePersonalSigns } from '@/personal/PersonalSignsProvider';
import { signIdFor } from '@/personal/store';
import { ALPHABET } from '@/personal/types';
import { useTheme } from '@/theme';

import { LetterTile } from './LetterTile';
import { TIPS } from './tips';

/** Learn: a map of every letter of the fingerspelling alphabet, and tips for signing. */
export function LearnScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const { get } = usePersonalSigns();
  const recorded = ALPHABET.filter((letter) => get(signIdFor({ kind: 'letter', letter })));
  const complete = recorded.length === ALPHABET.length;

  const openLetter = (letter: string) => {
    const id = signIdFor({ kind: 'letter', letter });
    if (get(id)) router.push({ pathname: '/signs/[id]', params: { id } });
    else router.push({ pathname: '/signs/teach', params: { kind: 'letter', letter } });
  };

  return (
    <Screen testID="learn-screen" title={t('learn.title')} subtitle={t('learn.subtitle')}>
      <View style={{ gap: spacing.sm }}>
        <View style={styles.sectionHeader}>
          <AppText variant="title" style={styles.flex}>
            {t('learn.alphabet.title')}
          </AppText>
          <Pill
            testID="alphabet-progress"
            tone={complete ? 'success' : 'primary'}
            label={t('learn.alphabet.progress', { count: recorded.length, total: ALPHABET.length })}
          />
        </View>
        <AppText variant="body" color="textSecondary">
          {t('learn.alphabet.description')}
        </AppText>
      </View>

      <View style={[styles.grid, { gap: spacing.sm }]} testID="alphabet-grid">
        {ALPHABET.map((letter) => (
          <LetterTile
            key={letter}
            letter={letter}
            sign={get(signIdFor({ kind: 'letter', letter }))}
            onPress={() => openLetter(letter)}
          />
        ))}
      </View>

      {complete ? null : (
        <Button
          testID="record-alphabet"
          icon="record-circle-outline"
          label={recorded.length === 0 ? t('learn.alphabet.recordAll') : t('learn.alphabet.recordRest')}
          onPress={() => router.push({ pathname: '/signs/teach', params: { kind: 'alphabet' } })}
        />
      )}
      <Notice tone="warning" icon="account-check-outline" message={t('learn.alphabet.sourceNotice')} />

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        <AppText variant="title">{t('learn.tipsTitle')}</AppText>
        <AppText variant="body" color="textSecondary">
          {t('learn.tipsIntro')}
        </AppText>
      </View>
      <Card padded={false} testID="tips" style={{ gap: 0 }}>
        {TIPS.map((tip, i) => (
          <Tip key={tip.id} id={tip.id} icon={tip.icon} first={i === 0} />
        ))}
      </Card>
      <AppText variant="caption" color="textSecondary">
        {t('learn.tipsReview')}
      </AppText>
    </Screen>
  );
}

function Tip({ id, icon, first }: { id: string; icon: IconName; first: boolean }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const title = t(`learn.tips.${id}.title` as 'learn.tips.attention.title');
  const body = t(`learn.tips.${id}.body` as 'learn.tips.attention.body');
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }}>
      <Pressable
        testID={`tip-${id}`}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [
          styles.tipRow,
          { padding: spacing.lg, gap: spacing.md, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
        ]}
      >
        <View style={[styles.tipIcon, { backgroundColor: colors.primaryContainer, borderRadius: radii.sm }]}>
          <Icon name={icon} size={20} color={colors.primary} />
        </View>
        <AppText variant="bodyStrong" style={styles.flex}>
          {title}
        </AppText>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textSecondary} />
      </Pressable>
      {open ? (
        <AppText
          testID={`tip-${id}-body`}
          variant="body"
          color="textSecondary"
          style={{ paddingRight: spacing.lg, paddingBottom: spacing.lg, paddingLeft: spacing.lg + 36 + spacing.md }}
        >
          {body}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tipRow: { flexDirection: 'row', alignItems: 'center' },
  tipIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
