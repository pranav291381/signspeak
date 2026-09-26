import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText, Button, Icon, Notice, Screen, StateView } from '@/components';
import { useHistory } from '@/history/HistoryProvider';
import type { HistoryEntry } from '@/history/history';
import { useTheme } from '@/theme';

function EntryRow({ entry }: { entry: HistoryEntry }) {
  const { t, i18n } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const when = new Date(entry.createdAt).toLocaleString(i18n.language);
  const kind = t(`history.kinds.${entry.kind}`);
  return (
    <View
      accessible
      accessibilityLabel={t('history.entryA11y', { kind, text: entry.text, when })}
      style={[styles.row, { borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, gap: spacing.md, backgroundColor: colors.surface }]}
    >
      <Icon name={entry.kind === 'recognition' ? 'camera-outline' : 'keyboard-outline'} color={colors.primary} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{entry.text}</AppText>
        <AppText variant="caption" color="textSecondary">
          {t('history.entryMeta', { kind, when })}
        </AppText>
      </View>
    </View>
  );
}

export function HistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const { enabled, entries, clear } = useHistory();

  if (!enabled) {
    return (
      <Screen testID="history-screen">
        <StateView
          testID="history-disabled"
          icon="history"
          title={t('history.disabledTitle')}
          message={t('history.disabledMessage')}
          action={{ label: t('common.openSettings'), icon: 'cog-outline', onPress: () => router.push('/settings') }}
        />
      </Screen>
    );
  }

  if (entries.length === 0) {
    return (
      <Screen testID="history-screen">
        <StateView testID="history-empty" icon="history" title={t('history.emptyTitle')} message={t('history.emptyMessage')} />
      </Screen>
    );
  }

  const confirmClear = () =>
    Alert.alert(t('history.confirmTitle'), t('history.confirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('history.clear'), style: 'destructive', onPress: clear },
    ]);

  return (
    <Screen testID="history-screen">
      <Notice tone="info" icon="shield-lock-outline" message={t('history.privacyNote')} />
      <View style={{ gap: spacing.sm }}>
        {entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} />
        ))}
      </View>
      <Button variant="danger" icon="delete-outline" label={t('history.clear')} onPress={confirmClear} testID="clear-history" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  flex: { flex: 1 },
});
