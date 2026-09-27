import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Screen, StateView } from '@/components';
import { usePersonalSigns } from '@/personal/PersonalSignsProvider';
import { useSettings } from '@/settings/SettingsProvider';

import { Recorder } from './Recorder';
import { parseTargets, type TeachParams } from './targets';
import { TeachChooser } from './TeachChooser';

/** Teach a sign: choose what it means, then record it a few times. */
export function TeachScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<TeachParams>();
  const { ready } = usePersonalSigns();

  return (
    <Screen testID="teach-screen">
      {!params.kind ? (
        <TeachChooser />
      ) : ready ? (
        <TeachTargets params={params} />
      ) : (
        <StateView loading title={t('common.loading')} />
      )}
    </Screen>
  );
}

/** Targets are fixed when the screen opens, so the alphabet list does not shrink mid-way. */
function TeachTargets({ params }: { params: TeachParams }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { settings } = useSettings();
  const { get } = usePersonalSigns();
  const [targets] = useState(() => parseTargets(params, settings.appLanguage, get));
  if (!targets) return <StateView icon="alert-circle-outline" title={t('teach.invalid')} />;
  return <Recorder targets={targets} onFinish={() => router.back()} />;
}
