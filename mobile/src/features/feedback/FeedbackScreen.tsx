import Constants from 'expo-constants';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Share, TextInput, View } from 'react-native';

import { AppText, Button, Notice, RadioGroup, Screen, Section, type RadioOption } from '@/components';
import {
  FEEDBACK_FEATURES,
  feedbackServerUrl,
  formatForSharing,
  isFeature,
  isIssueType,
  ISSUE_TYPES,
  MAX_DESCRIPTION,
  MAX_EXPECTED,
  submitFeedback,
  validateFeedback,
  type FeedbackFeature,
  type FeedbackReport,
  type IssueType,
  type SubmitResult,
} from '@/feedback/feedback';
import { useSettings } from '@/settings/SettingsProvider';
import { MIN_TOUCH_TARGET, useTheme } from '@/theme';

type Params = { feature?: string; issue?: string; label?: string; simulated?: string };

function platformName(): FeedbackReport['environment']['platform'] {
  return Platform.OS === 'android' || Platform.OS === 'ios' || Platform.OS === 'web' ? Platform.OS : 'other';
}

interface Props {
  /** Injected in tests. */
  serverUrl?: string | null;
  fetchImpl?: typeof fetch;
}

export function FeedbackScreen({ serverUrl = feedbackServerUrl(), fetchImpl }: Props) {
  const { t } = useTranslation();
  const { colors, radii, spacing, typography } = useTheme();
  const { settings } = useSettings();
  const params = useLocalSearchParams<Params>();

  const [feature, setFeature] = useState<FeedbackFeature>(isFeature(params.feature) ? params.feature : 'other');
  const [issue, setIssue] = useState<IssueType>(isIssueType(params.issue) ? params.issue : 'other');
  const [description, setDescription] = useState('');
  const [expected, setExpected] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const prediction: FeedbackReport['model_prediction'] = params.label
    ? { label: params.label, band: null, model_id: null, simulated: params.simulated === 'true' }
    : null;

  const report: FeedbackReport = {
    feature,
    issue_type: issue,
    description: description.trim(),
    expected_result: expected.trim() || null,
    model_prediction: prediction,
    environment: {
      app_version: Constants.expoConfig?.version ?? 'unknown',
      platform: platformName(),
      os_version: String(Platform.Version ?? '') || null,
      app_language: settings.appLanguage,
      output_language: settings.outputLanguage,
    },
    metadata: {},
  };
  const problems = validateFeedback(report);

  const inputStyle = [
    typography.body,
    {
      minHeight: MIN_TOUCH_TARGET,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      color: colors.text,
      backgroundColor: colors.surface,
    },
  ];

  const guard = (action: () => void) => () => {
    setShowErrors(true);
    if (problems.length === 0) action();
  };

  const share = guard(() => {
    Share.share({ message: formatForSharing(report) }).catch(() => undefined);
  });

  const send = guard(() => {
    if (!serverUrl) return;
    setSending(true);
    setResult(null);
    submitFeedback(serverUrl, report, fetchImpl).then((outcome) => {
      setSending(false);
      setResult(outcome);
    });
  });

  const featureOptions: RadioOption<FeedbackFeature>[] = FEEDBACK_FEATURES.map((value) => ({
    value,
    label: t(`feedback.features.${value}`),
  }));
  const issueOptions: RadioOption<IssueType>[] = ISSUE_TYPES.map((value) => ({ value, label: t(`feedback.issues.${value}`) }));

  return (
    <Screen testID="feedback-screen">
      <Notice tone="warning" icon="shield-account-outline" message={t('feedback.privacyWarning')} />

      <Section>
        <RadioGroup testID="feedback-feature" label={t('feedback.featureLabel')} options={featureOptions} value={feature} onChange={setFeature} />
        <RadioGroup testID="feedback-issue" label={t('feedback.issueLabel')} options={issueOptions} value={issue} onChange={setIssue} />
      </Section>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="bodyStrong">{t('feedback.descriptionLabel')}</AppText>
        <TextInput
          testID="feedback-description"
          accessibilityLabel={t('feedback.descriptionLabel')}
          value={description}
          onChangeText={setDescription}
          maxLength={MAX_DESCRIPTION}
          multiline
          style={[inputStyle, { minHeight: 120, textAlignVertical: 'top' }]}
        />
        {showErrors && problems.includes('description_required') ? (
          <Notice tone="danger" message={t('feedback.descriptionRequired')} testID="feedback-description-error" />
        ) : null}
        <AppText variant="bodyStrong">{t('feedback.expectedLabel')}</AppText>
        <TextInput
          testID="feedback-expected"
          accessibilityLabel={t('feedback.expectedLabel')}
          value={expected}
          onChangeText={setExpected}
          maxLength={MAX_EXPECTED}
          style={inputStyle}
        />
      </View>

      <Section title={t('feedback.includedTitle')}>
        <AppText variant="caption" color="textSecondary" testID="feedback-included">
          {t('feedback.included', {
            version: report.environment.app_version,
            platform: report.environment.platform,
            os: report.environment.os_version ?? '—',
            appLanguage: report.environment.app_language,
            outputLanguage: report.environment.output_language,
          })}
        </AppText>
        {prediction ? (
          <AppText variant="caption" color="textSecondary">
            {t(prediction.simulated ? 'feedback.includedPredictionSimulated' : 'feedback.includedPrediction', {
              label: prediction.label,
            })}
          </AppText>
        ) : null}
      </Section>

      <Button testID="feedback-share" icon="share-variant-outline" label={t('feedback.share')} onPress={share} />
      {serverUrl ? (
        <Button
          testID="feedback-send"
          variant="secondary"
          icon="send-outline"
          label={t('feedback.send')}
          accessibilityHint={t('feedback.sendHint')}
          busy={sending}
          onPress={send}
        />
      ) : null}

      {result?.status === 'sent' ? (
        <Notice tone="success" message={t('feedback.sent', { id: result.reportId })} testID="feedback-sent" />
      ) : null}
      {result?.status === 'offline' ? <Notice tone="warning" icon="wifi-off" message={t('feedback.offline')} testID="feedback-offline" /> : null}
      {result?.status === 'rejected' || result?.status === 'error' ? (
        <Notice tone="danger" message={t('feedback.failed')} testID="feedback-failed" />
      ) : null}
    </Screen>
  );
}
