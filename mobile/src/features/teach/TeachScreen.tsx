import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Screen, StateView } from '@/components';
import { usePersonalSigns } from '@/personal/PersonalSignsProvider';
import { useSettings } from '@/settings/SettingsProvider';
import { useSignVocabulary } from '@/signpack/SignVocabularyProvider';

import { Recorder } from './Recorder';
import { parseTargets, type TeachParams } from './targets';
import { TeachChooser } from './TeachChooser';

/** Teach a sign: choose what it means, then record it a few times. */
export function TeachScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<TeachParams>();
  const { ready } = usePersonalSigns();
  const vocabulary = useSignVocabulary();
  // A sign of the vocabulary is named from it, so wait for it to load.
  const waiting = !ready || (params.kind === 'vocabulary' && (vocabulary.status === 'idle' || vocabulary.status === 'loading'));

  return (
    <Screen testID="teach-screen">
      {!params.kind ? (
        <TeachChooser />
      ) : !waiting ? (
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
  const vocabularyState = useSignVocabulary();
  const vocabulary = vocabularyState.status === 'ready' ? vocabularyState.vocabulary : null;
  const [targets] = useState(() => parseTargets(params, settings.appLanguage, get, (label) => vocabulary?.describe(label) ?? undefined));
  if (!targets) return <StateView icon="alert-circle-outline" title={t('teach.invalid')} />;
  return <Recorder targets={targets} onFinish={() => router.back()} />;
}
