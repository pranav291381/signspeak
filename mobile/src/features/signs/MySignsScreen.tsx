import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  Card,
  confirmAction,
  Icon,
  IconTile,
  Notice,
  Pill,
  PressableScale,
  Screen,
  SegmentedControl,
  StateView,
  TextField,
} from '@/components';
import { normalizeText } from '@/content/matcher';
import { SignDiagram } from '@/diagram/SignDiagram';
import { buildExport, exportFileName } from '@/personal/exportSigns';
import { signText } from '@/personal/labels';
import { usePersonalSigns } from '@/personal/PersonalSignsProvider';
import { shareJsonFile } from '@/personal/shareFile';
import { sampleFrames, signIdFor } from '@/personal/store';
import { ALPHABET, MIN_SAMPLES_FOR_RECOGNITION, type PersonalSign } from '@/personal/types';
import { useSettings } from '@/settings/SettingsProvider';
import { useTheme } from '@/theme';

import { LetterTile } from './LetterTile';
import { teachParams } from './teachParams';

/** A search field appears once the list is this long. */
const SEARCH_FROM = 6;

type Filter = 'all' | 'app' | 'own';
type ExportState = { status: 'idle' | 'busy' | 'unavailable' | 'failed' };

/** Words the person typed themselves, as opposed to signs the app already knows. */
const isOwnWord = (sign: PersonalSign) => sign.target.kind === 'custom';

/**
 * My signs: everything taught on this phone. Teaching makes recognition fit the
 * way this person signs, and covers words no public dataset has; the signs can
 * be exported as a file the person chooses to share.
 */
export function MySignsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const { settings } = useSettings();
  const { ready, signs, get, removeAll } = usePersonalSigns();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [exporting, setExporting] = useState<ExportState>({ status: 'idle' });

  const words = useMemo(
    () =>
      signs
        .filter((s) => s.target.kind !== 'letter')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)),
    [signs],
  );
  const lettersDone = ALPHABET.filter((letter) => get(signIdFor({ kind: 'letter', letter }))).length;
  const takes = signs.reduce((n, s) => n + s.samples.length, 0);
  const readyCount = signs.filter((s) => s.samples.length >= MIN_SAMPLES_FOR_RECOGNITION).length;
  const ownCount = words.filter(isOwnWord).length;
  const bothKinds = ownCount > 0 && ownCount < words.length;

  // The query applies only while the search field is shown (it hides again below SEARCH_FROM signs).
  const needle = words.length >= SEARCH_FROM ? normalizeText(query) : '';
  const shown = words.filter(
    (s) =>
      (filter === 'all' || !bothKinds || (filter === 'own') === isOwnWord(s)) &&
      (!needle || normalizeText(signText(s, settings.outputLanguage)).includes(needle)),
  );
  const unfinished = shown.filter((s) => s.samples.length < MIN_SAMPLES_FOR_RECOGNITION);
  const finished = shown.filter((s) => s.samples.length >= MIN_SAMPLES_FOR_RECOGNITION);

  const teach = () => router.push('/signs/teach');
  const open = useCallback((sign: PersonalSign) => router.push({ pathname: '/signs/[id]', params: { id: sign.id } }), [router]);
  const record = useCallback(
    (sign: PersonalSign) => router.push({ pathname: '/signs/teach', params: teachParams(sign.target) }),
    [router],
  );
  const openLetter = useCallback(
    (letter: string) => {
      const sign = get(signIdFor({ kind: 'letter', letter }));
      if (sign) open(sign);
      else router.push({ pathname: '/signs/teach', params: { kind: 'letter', letter } });
    },
    [get, open, router],
  );

  const exportSigns = () =>
    confirmAction({
      title: t('signs.export.confirmTitle'),
      message: t('signs.export.confirmMessage'),
      confirmLabel: t('signs.export.confirm'),
      cancelLabel: t('common.cancel'),
      destructive: false,
      onConfirm: () => {
        setExporting({ status: 'busy' });
        // Let the busy state show before the file is built; any failure ends in the "failed" notice.
        new Promise((resolve) => setTimeout(resolve, 0))
          .then(() => {
            const file = buildExport(signs, Constants.expoConfig?.version ?? 'unknown');
            return shareJsonFile(exportFileName(), JSON.stringify(file), t('signs.export.dialogTitle'));
          })
          .then((shared) => setExporting({ status: shared ? 'idle' : 'unavailable' }))
          .catch(() => setExporting({ status: 'failed' }));
      },
    });

  if (!ready) {
    return (
      <Screen title={t('signs.title')}>
        <StateView loading title={t('common.loading')} />
      </Screen>
    );
  }

  return (
    <Screen testID="my-signs-screen" title={t('signs.title')} subtitle={t('signs.subtitle')}>
      <Overview readyCount={readyCount} takes={takes} letters={lettersDone} empty={signs.length === 0} onTeach={teach} />

      {words.length === 0 ? null : (
        <View style={{ gap: spacing.md }}>
          {words.length >= SEARCH_FROM ? (
            <TextField
              testID="my-signs-search"
              label={t('signs.search.label')}
              placeholder={t('signs.search.placeholder')}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
          ) : null}
          {bothKinds ? (
            <SegmentedControl
              testID="my-signs-filter"
              label={t('signs.filter.label')}
              value={filter}
              onChange={setFilter}
              segments={[
                { value: 'all', label: t('signs.filter.all') },
                { value: 'app', label: t('signs.filter.app') },
                { value: 'own', label: t('signs.filter.own') },
              ]}
            />
          ) : null}

          {unfinished.length > 0 ? (
            <SignList
              testID="my-signs-unfinished"
              title={t('signs.unfinished.title')}
              description={t('signs.unfinished.description')}
              signs={unfinished}
              onOpen={open}
              onRecord={record}
            />
          ) : null}
          {finished.length > 0 ? (
            <SignList
              testID="my-signs-list"
              title={t('signs.words', { count: finished.length })}
              signs={finished}
              onOpen={open}
            />
          ) : null}
          {shown.length === 0 ? (
            <AppText variant="caption" color="textSecondary" testID="my-signs-no-matches">
              {t('signs.search.none')}
            </AppText>
          ) : null}
        </View>
      )}

      <Alphabet done={lettersDone} onLetter={openLetter} onRecordAll={() => router.push({ pathname: '/signs/teach', params: { kind: 'alphabet' } })} />

      <Card testID="my-signs-export" style={{ gap: spacing.md }}>
        <View style={[styles.row, { gap: spacing.md }]}>
          <IconTile icon="hand-heart-outline" tile="teal" size={40} />
          <AppText variant="heading" style={styles.flex}>
            {t('signs.export.title')}
          </AppText>
        </View>
        <AppText variant="body" color="textSecondary">
          {t('signs.export.description')}
        </AppText>
        <Button
          testID="my-signs-export-button"
          variant="secondary"
          icon="export-variant"
          label={t('signs.export.button')}
          disabled={signs.length === 0}
          busy={exporting.status === 'busy'}
          onPress={exportSigns}
        />
        {exporting.status === 'unavailable' ? <Notice tone="warning" message={t('signs.export.unavailable')} /> : null}
        {exporting.status === 'failed' ? <Notice tone="danger" message={t('signs.export.failed')} /> : null}
      </Card>

      <Notice tone="info" icon="shield-lock-outline" message={t('signs.privacy')} />

      {signs.length > 0 ? (
        <Button
          testID="delete-all-signs"
          variant="outline"
          icon="delete-outline"
          label={t('signs.deleteAll')}
          onPress={() =>
            confirmAction({
              title: t('signs.deleteAllTitle'),
              message: t('signs.deleteAllMessage'),
              confirmLabel: t('signs.deleteAll'),
              cancelLabel: t('common.cancel'),
              onConfirm: () => void removeAll(),
            })
          }
        />
      ) : null}
    </Screen>
  );
}

/** How much has been taught, and the way to teach more. */
function Overview({
  readyCount,
  takes,
  letters,
  empty,
  onTeach,
}: {
  readyCount: number;
  takes: number;
  letters: number;
  empty: boolean;
  onTeach: () => void;
}) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const ink = colors.onAccent;
  return (
    <View testID="my-signs-overview" style={[styles.overview, { backgroundColor: colors.accent, borderRadius: radii.xl, padding: spacing.xl - 2, gap: spacing.md }]}>
      {empty ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="title" accessibilityRole="none" style={{ color: ink }}>
            {t('signs.overview.emptyTitle')}
          </AppText>
          <AppText variant="body" style={{ color: ink, opacity: 0.86 }}>
            {t('signs.overview.emptyMessage')}
          </AppText>
        </View>
      ) : (
        <View style={[styles.row, styles.stats, { gap: spacing.lg }]} accessible accessibilityLabel={t('signs.overview.a11y', { ready: readyCount, takes, letters, total: ALPHABET.length })}>
          <Stat value={String(readyCount)} label={t('signs.overview.ready', { count: readyCount })} color={ink} big />
          <Stat value={String(takes)} label={t('signs.overview.takes', { count: takes })} color={ink} />
          <Stat value={`${letters}/${ALPHABET.length}`} label={t('signs.overview.letters')} color={ink} />
        </View>
      )}
      <PressableScale
        testID="my-signs-teach"
        accessibilityRole="button"
        accessibilityLabel={t('home.signs.teach')}
        onPress={onTeach}
        pressedScale={0.97}
        style={[styles.row, styles.cta, { backgroundColor: ink, borderRadius: radii.pill, gap: spacing.sm }]}
      >
        <Icon name="plus" size={18} color={colors.accent} />
        <AppText variant="label" style={{ color: colors.accent }}>
          {t('home.signs.teach')}
        </AppText>
      </PressableScale>
    </View>
  );
}

function Stat({ value, label, color, big = false }: { value: string; label: string; color: string; big?: boolean }) {
  return (
    <View style={big ? styles.flex : null}>
      <AppText variant={big ? 'display' : 'title'} accessibilityRole="none" style={{ color }}>
        {value}
      </AppText>
      <AppText variant="caption" style={{ color, opacity: 0.86 }}>
        {label}
      </AppText>
    </View>
  );
}

function SignList({
  title,
  description,
  signs,
  onOpen,
  onRecord,
  testID,
}: {
  title: string;
  description?: string;
  signs: PersonalSign[];
  onOpen: (sign: PersonalSign) => void;
  onRecord?: (sign: PersonalSign) => void;
  testID: string;
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }} testID={testID}>
      <View style={{ gap: 2, paddingHorizontal: spacing.xs }}>
        <AppText variant="overline" color="textSecondary" accessibilityRole="header">
          {title}
        </AppText>
        {description ? (
          <AppText variant="caption" color="textSecondary">
            {description}
          </AppText>
        ) : null}
      </View>
      <Card padded={false} style={{ gap: 0 }}>
        {signs.map((sign, i) => (
          <SignRow key={sign.id} sign={sign} first={i === 0} onOpen={onOpen} onRecord={onRecord} />
        ))}
      </Card>
    </View>
  );
}

const SignRow = memo(function SignRow({
  sign,
  first,
  onOpen,
  onRecord,
}: {
  sign: PersonalSign;
  first: boolean;
  onOpen: (sign: PersonalSign) => void;
  onRecord?: (sign: PersonalSign) => void;
}) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { settings } = useSettings();
  const name = signText(sign, settings.outputLanguage);
  const takes = sign.samples.length;
  const ready = takes >= MIN_SAMPLES_FOR_RECOGNITION;
  const kind = isOwnWord(sign) ? t('signs.kind.own') : t('signs.kind.app');
  const frames = useMemo(() => {
    try {
      return sign.samples[0] ? sampleFrames(sign.samples[0]) : null;
    } catch {
      return null;
    }
  }, [sign]);
  const status = ready ? t('signs.ready') : t('signs.needsMore', { count: MIN_SAMPLES_FOR_RECOGNITION - takes });

  return (
    <View style={[styles.row, { borderTopWidth: first ? 0 : 1, borderTopColor: colors.border }]}>
      <PressableScale
        testID={`sign-row-${sign.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${name}. ${kind}. ${t('signs.takes', { count: takes })}. ${status}`}
        onPress={() => onOpen(sign)}
        style={({ pressed }) => [
          styles.row,
          styles.flex,
          { padding: spacing.md, gap: spacing.md, backgroundColor: pressed ? colors.surfaceAlt : 'transparent' },
        ]}
      >
        <View style={[styles.thumb, { backgroundColor: colors.surfaceAlt, borderRadius: radii.md }]}>
          {frames ? <SignDiagram frames={frames} playing={false} accessibilityLabel="" /> : null}
        </View>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{name}</AppText>
          <AppText variant="caption" color="textSecondary">
            {t('signs.rowDetail', { kind, takes: t('signs.takes', { count: takes }) })}
          </AppText>
        </View>
        {onRecord ? null : <Pill tone={ready ? 'success' : 'warning'} label={status} />}
        {onRecord ? null : <Icon name="chevron-right" size={22} color={colors.textSecondary} />}
      </PressableScale>
      {onRecord ? (
        <View style={{ paddingRight: spacing.md }}>
          <Button
            testID={`record-${sign.id}`}
            size="sm"
            icon="record-circle-outline"
            label={t('signs.unfinished.record')}
            accessibilityLabel={t('signs.unfinished.recordA11y', { name })}
            onPress={() => onRecord(sign)}
          />
        </View>
      ) : null}
    </View>
  );
});

/** The fingerspelling alphabet as recorded on this phone. */
function Alphabet({ done, onLetter, onRecordAll }: { done: number; onLetter: (letter: string) => void; onRecordAll: () => void }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { get } = usePersonalSigns();
  const [expanded, setExpanded] = useState(false);
  const complete = done === ALPHABET.length;
  // Folded, only the letters recorded so far are shown: 26 empty tiles would push everything else away.
  const letters = expanded || complete ? ALPHABET : ALPHABET.filter((letter) => get(signIdFor({ kind: 'letter', letter })));
  return (
    <View style={{ gap: spacing.sm }} testID="my-signs-alphabet">
      <View style={[styles.row, { gap: spacing.sm, paddingHorizontal: spacing.xs }]}>
        <AppText variant="overline" color="textSecondary" accessibilityRole="header" style={styles.flex}>
          {t('signs.alphabet.title')}
        </AppText>
        <Pill testID="alphabet-progress" tone={complete ? 'success' : 'primary'} label={`${done} / ${ALPHABET.length}`} />
      </View>
      <AppText variant="caption" color="textSecondary" style={{ paddingHorizontal: spacing.xs }}>
        {t('signs.alphabet.description')}
      </AppText>
      {letters.length > 0 ? (
        <View style={[styles.grid, { gap: spacing.sm }]} testID="alphabet-grid">
          {letters.map((letter) => (
            <LetterTile key={letter} letter={letter} sign={get(signIdFor({ kind: 'letter', letter }))} onPress={onLetter} />
          ))}
        </View>
      ) : null}
      {complete ? null : (
        <Button
          testID="alphabet-toggle"
          variant="ghost"
          icon={expanded ? 'chevron-up' : 'chevron-down'}
          label={expanded ? t('signs.alphabet.showRecorded') : t('signs.alphabet.showAll')}
          onPress={() => setExpanded((e) => !e)}
        />
      )}
      {complete ? null : (
        <Button
          testID="record-alphabet"
          variant="outline"
          icon="record-circle-outline"
          label={done === 0 ? t('signs.alphabet.recordAll') : t('signs.alphabet.recordRest')}
          onPress={onRecordAll}
        />
      )}
      <Notice tone="warning" icon="account-check-outline" message={t('signs.alphabet.sourceNotice')} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  overview: { overflow: 'hidden' },
  stats: { alignItems: 'flex-end' },
  cta: { alignSelf: 'flex-start', paddingHorizontal: 20, minHeight: 48, justifyContent: 'center' },
  thumb: { width: 56, height: 56, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
