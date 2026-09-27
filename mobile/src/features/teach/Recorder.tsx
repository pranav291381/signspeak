import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppActive } from '@/accessibility/useAppActive';
import { AppText, Button, Card, IconButton, Notice, Pill } from '@/components';
import { SignDiagram } from '@/diagram/SignDiagram';
import { handsVisible } from '@/recognition/features';
import type { LandmarkFrame } from '@/recognition/types';
import { signText, targetText } from '@/personal/labels';
import { buildTemplate, prepareQuery, relativeDistance } from '@/personal/matcher';
import { usePersonalSigns } from '@/personal/PersonalSignsProvider';
import { prepareSample, type SampleProblem } from '@/personal/sample';
import { signIdFor } from '@/personal/store';
import type { SignTarget } from '@/personal/types';
import { useSettings } from '@/settings/SettingsProvider';
import { useTheme } from '@/theme';

import { CameraGate } from '../camera/CameraGate';
import { CameraStage } from '../camera/CameraStage';
import { recordingMs, takesWanted } from './targets';

type Phase =
  | { name: 'idle' }
  | { name: 'countdown'; count: number }
  | { name: 'recording' }
  | { name: 'review'; frames: Float32Array[]; different: boolean }
  | { name: 'problem'; problem: SampleProblem }
  | { name: 'saving' }
  | { name: 'saveFailed' }
  | { name: 'done' };

const COUNTDOWN_FROM = 3;
/** A take this far from the earlier ones (relative to their spread) is flagged. */
const DIFFERENT_RATIO = 1.6;

interface Props {
  /** Signs to record, in order (several for the alphabet). */
  targets: SignTarget[];
  onFinish: () => void;
}

/**
 * Records takes of a sign: countdown, a few seconds of landmarks, an animated
 * replay and quality checks, then saves on this phone. Video is never stored.
 */
export function Recorder({ targets, onFinish }: Props) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { settings } = useSettings();
  const { get, addSample } = usePersonalSigns();
  const focused = useIsFocused();
  const appActive = useAppActive();

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [ready, setReady] = useState(false);
  const [live, setLive] = useState<'none' | 'person' | 'hands'>('none');
  const [elapsed, setElapsed] = useState(0);
  const buffer = useRef<LandmarkFrame[]>([]);
  const recording = useRef(false);

  const target = targets[Math.min(index, targets.length - 1)]!;
  const id = signIdFor(target);
  const sign = get(id);
  const takes = sign?.samples.length ?? 0;
  const wanted = takesWanted(target);
  const duration = recordingMs(target);
  const title = sign ? signText(sign, settings.outputLanguage) : targetText(target, settings.outputLanguage).text;
  const isLetter = target.kind === 'letter';
  const hasNext = index < targets.length - 1;

  const visible = focused && appActive;

  // Countdown, then record for a fixed time. Leaving the screen or the app cancels.
  useEffect(() => {
    if (!visible && (phase.name === 'countdown' || phase.name === 'recording')) {
      recording.current = false;
      const timer = setTimeout(() => setPhase({ name: 'idle' }), 0);
      return () => clearTimeout(timer);
    }
    if (phase.name === 'countdown') {
      const timer = setTimeout(() => {
        if (phase.count > 1) {
          setPhase({ name: 'countdown', count: phase.count - 1 });
        } else {
          buffer.current = [];
          recording.current = true;
          setElapsed(0);
          setPhase({ name: 'recording' });
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
    if (phase.name === 'recording') {
      let ticks = 0;
      const tick = setInterval(() => setElapsed((ticks += 1) * 100), 100);
      const stop = setTimeout(() => {
        recording.current = false;
        const prepared = prepareSample(buffer.current);
        buffer.current = [];
        if (!prepared.ok) {
          setPhase({ name: 'problem', problem: prepared.problem });
          return;
        }
        let different = false;
        const existing = get(id);
        if (existing && existing.samples.length > 0) {
          const template = buildTemplate(existing);
          const query = prepareQuery(prepared.frames);
          different = template !== null && query !== null && relativeDistance(template, query) > DIFFERENT_RATIO;
        }
        setPhase({ name: 'review', frames: prepared.frames, different });
      }, duration);
      return () => {
        clearInterval(tick);
        clearTimeout(stop);
      };
    }
  }, [phase, visible, duration, get, id]);

  const onFrame = (timestampMs: number, values: number[] | null) => {
    const next = values === null ? 'none' : handsVisible(values) ? 'hands' : 'person';
    setLive((current) => (current === next ? current : next));
    if (recording.current) buffer.current.push({ timestampMs, values: values ? Float32Array.from(values) : null });
  };

  const keep = async (frames: Float32Array[]) => {
    setPhase({ name: 'saving' });
    try {
      const updated = await addSample(target, frames);
      setPhase(updated.samples.length >= wanted ? { name: 'done' } : { name: 'idle' });
    } catch {
      setPhase({ name: 'saveFailed' });
    }
  };

  const nextTarget = () => {
    setIndex((i) => i + 1);
    setPhase({ name: 'idle' });
  };

  const busy = phase.name === 'countdown' || phase.name === 'recording';
  const liveTone = live === 'hands' ? 'success' : 'warning';
  const liveLabel =
    live === 'hands' ? t('teach.live.hands') : live === 'person' ? t('teach.live.noHands') : t('teach.live.noPerson');

  return (
    <View style={{ gap: spacing.lg }} testID="recorder">
      <View style={{ gap: 2 }}>
        <AppText variant="overline" color="textSecondary">
          {targets.length > 1 ? t('teach.alphabetProgress', { current: index + 1, total: targets.length }) : t('teach.teaching')}
        </AppText>
        <AppText variant="display" testID="teach-title">
          {title}
        </AppText>
        <AppText variant="caption" color="textSecondary" testID="teach-takes">
          {t('teach.takes', { count: takes, wanted })}
        </AppText>
      </View>

      <CameraGate>
        <CameraStage
          testID="teach-camera"
          facing={facing}
          active={visible}
          onFrame={onFrame}
          onReadyChange={setReady}
          overlayTop={
            <>
              <Pill tone={liveTone} icon={live === 'hands' ? 'check' : 'alert-outline'} label={liveLabel} testID="teach-live" />
              <View style={styles.flex} />
              {busy ? null : (
                <IconButton
                  variant="overlay"
                  icon="camera-flip-outline"
                  accessibilityLabel={t('signToText.controls.switchCamera')}
                  onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
                />
              )}
            </>
          }
          overlayCenter={
            phase.name === 'countdown' ? (
              <View
                accessible
                accessibilityLiveRegion="assertive"
                accessibilityLabel={String(phase.count)}
                style={[styles.countdown, { backgroundColor: colors.scrim }]}
              >
                <AppText variant="display" color="onScrim" style={styles.countdownText}>
                  {phase.count}
                </AppText>
              </View>
            ) : null
          }
          overlayBottom={
            phase.name === 'recording' ? (
              <View style={{ gap: spacing.sm }}>
                <Pill tone="danger" icon="record-circle" label={t('teach.recording')} testID="teach-recording" />
                <View style={[styles.track, { borderRadius: radii.pill }]}>
                  <View
                    style={{
                      height: 6,
                      borderRadius: radii.pill,
                      backgroundColor: colors.onScrim,
                      width: `${Math.min(100, Math.round((elapsed / duration) * 100))}%`,
                    }}
                  />
                </View>
              </View>
            ) : null
          }
        />
      </CameraGate>

      {phase.name === 'idle' ? (
        <Card>
          <AppText variant="body" color="textSecondary">
            {isLetter ? t('teach.instructionsLetter') : t('teach.instructions')}
          </AppText>
          <Button
            testID="teach-record"
            icon="record-circle-outline"
            label={takes === 0 ? t('teach.record') : t('teach.recordAgain')}
            disabled={!ready}
            onPress={() => setPhase({ name: 'countdown', count: COUNTDOWN_FROM })}
          />
        </Card>
      ) : null}

      {busy ? (
        <Button
          testID="teach-cancel"
          variant="outline"
          label={t('common.cancel')}
          onPress={() => {
            recording.current = false;
            setPhase({ name: 'idle' });
          }}
        />
      ) : null}

      {phase.name === 'review' ? (
        <Card testID="teach-review">
          <AppText variant="heading">{t('teach.reviewTitle')}</AppText>
          <View style={[styles.replay, { backgroundColor: colors.surfaceAlt, borderRadius: radii.lg }]}>
            <SignDiagram
              frames={phase.frames}
              focus={isLetter ? 'hands' : 'body'}
              accessibilityLabel={t('diagram.a11y', { text: title })}
            />
          </View>
          {phase.different ? (
            <Notice tone="warning" message={t('teach.different')} testID="teach-different" />
          ) : (
            <Notice tone="success" message={t('teach.good')} />
          )}
          <View style={[styles.row, { gap: spacing.sm }]}>
            <View style={styles.flex}>
              <Button
                testID="teach-retake"
                variant="secondary"
                icon="restore"
                label={t('teach.retake')}
                onPress={() => setPhase({ name: 'idle' })}
              />
            </View>
            <View style={styles.flex}>
              <Button testID="teach-keep" icon="check" label={t('teach.keep')} onPress={() => void keep(phase.frames)} />
            </View>
          </View>
        </Card>
      ) : null}

      {phase.name === 'saving' ? <Button label={t('teach.saving')} busy onPress={() => undefined} /> : null}

      {phase.name === 'problem' ? (
        <Card>
          <Notice tone="warning" title={t('teach.problemTitle')} message={t(`teach.problems.${phase.problem}`)} testID="teach-problem" />
          <Button testID="teach-try-again" icon="refresh" label={t('common.retry')} onPress={() => setPhase({ name: 'idle' })} />
        </Card>
      ) : null}

      {phase.name === 'saveFailed' ? (
        <Card>
          <Notice tone="danger" message={t('teach.saveFailed')} testID="teach-save-failed" />
          <Button icon="refresh" label={t('common.retry')} onPress={() => setPhase({ name: 'idle' })} />
        </Card>
      ) : null}

      {phase.name === 'done' ? (
        <Card testID="teach-done">
          <Notice
            tone="success"
            title={t('teach.doneTitle')}
            message={isLetter ? t('teach.doneLetter') : t('teach.doneMessage')}
          />
          {hasNext ? (
            <Button testID="teach-next" icon="arrow-right" label={t('teach.nextLetter')} onPress={nextTarget} />
          ) : (
            <Button testID="teach-finish" icon="check" label={t('teach.finish')} onPress={onFinish} />
          )}
          <Button
            variant="secondary"
            icon="plus"
            label={t('teach.anotherTake')}
            onPress={() => setPhase({ name: 'idle' })}
          />
          {hasNext ? <Button variant="ghost" label={t('teach.stop')} onPress={onFinish} /> : null}
        </Card>
      ) : null}

      {phase.name === 'idle' && hasNext ? (
        <Button variant="ghost" icon="skip-next" label={t('teach.skipLetter')} onPress={nextTarget} testID="teach-skip" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row' },
  countdown: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  countdownText: { fontSize: 56, lineHeight: 64 },
  track: { height: 6, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  replay: { width: '100%', aspectRatio: 1, overflow: 'hidden' },
});
