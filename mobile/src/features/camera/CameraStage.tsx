import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, useWindowDimensions, View } from 'react-native';

import { AppText, Button, Icon, PressableScale } from '@/components';
import { LandmarkCamera } from '@/engine/LandmarkCamera';
import type { EngineErrorCode, EngineFacing, EngineStatus } from '@/engine/protocol';
import type { EngineLink, TrackingDetails } from '@/engine/types';
import { useTheme } from '@/theme';

interface Props {
  facing: EngineFacing;
  /** False releases the camera (screen hidden, app in background, paused). */
  active: boolean;
  onFrame?: (timestampMs: number, values: number[] | null, hands: number) => void;
  /** Called when tracking starts or stops producing frames. */
  onReadyChange?: (ready: boolean) => void;
  /** Increment to flash the hand skeleton. */
  flashSignal?: number;
  /** Runs the sign model in the engine page. */
  model?: EngineLink;
  /** Shown over the preview while tracking runs. */
  overlayTop?: ReactNode;
  overlayCenter?: ReactNode;
  overlayBottom?: ReactNode;
  testID?: string;
}

let lastNote = '';
/**
 * Why tracking runs on the GPU or the CPU (the renderer's name, a GPU that
 * failed to start, measured times). Logged once per change: it shows in the
 * terminal running `npm start`, to diagnose slow phones.
 */
function logEngineNote(delegate: 'GPU' | 'CPU' | undefined, note: string | undefined): void {
  const line = `${delegate ?? '?'}: ${note ?? ''}`;
  if (!note || line === lastNote) return;
  lastNote = line;
  console.info(`[SignSpeak camera] tracking on ${line}`);
}

/** Camera preview with live hand tracking, its loading and error states, and overlay slots. */
export function CameraStage({
  facing,
  active,
  onFrame,
  onReadyChange,
  flashSignal,
  model,
  overlayTop,
  overlayCenter,
  overlayBottom,
  testID,
}: Props) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { width } = useWindowDimensions();
  const [status, setStatus] = useState<EngineStatus>('loading');
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [error, setError] = useState<EngineErrorCode | null>(null);
  const [stats, setStats] = useState<({ fps: number; delegate?: 'GPU' | 'CPU'; note?: string } & TrackingDetails) | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  // Remounting the engine is the retry: it reloads models and reopens the camera.
  const [attempt, setAttempt] = useState(0);
  const running = status === 'running' && !error;

  const update = (next: EngineStatus, value?: number) => {
    setStatus(next);
    setProgress(value);
    onReadyChange?.(next === 'running');
  };

  return (
    <View
      testID={testID}
      style={[
        styles.stage,
        { aspectRatio: width >= 600 ? 4 / 3 : 3 / 4, borderRadius: radii.xl, backgroundColor: '#111318' },
      ]}
    >
      <LandmarkCamera
        key={attempt}
        testID="landmark-camera"
        facing={facing}
        active={active}
        flashSignal={flashSignal}
        model={model}
        style={StyleSheet.absoluteFill}
        onFrame={onFrame}
        onStatus={update}
        onStats={(fps, _inferenceMs, delegate, note, details) => {
          setStats({ fps, delegate, note, ...details });
          logEngineNote(delegate, note);
        }}
        onError={(code) => {
          setError(code);
          onReadyChange?.(false);
        }}
      />

      {running ? (
        <>
          {overlayTop ? <View style={[styles.top, { padding: spacing.md }]}>{overlayTop}</View> : null}
          {overlayCenter ? (
            <View pointerEvents="box-none" style={styles.center}>
              {overlayCenter}
            </View>
          ) : null}
          {overlayBottom ? <View style={[styles.bottom, { padding: spacing.md }]}>{overlayBottom}</View> : null}
          {stats && stats.fps > 0 ? (
            <>
              {showDetails ? (
                <View
                  testID="tracking-details"
                  accessible
                  accessibilityLiveRegion="polite"
                  style={[styles.details, { backgroundColor: colors.scrim, borderRadius: radii.md, padding: spacing.sm, gap: 2 }]}
                >
                  <AppText variant="label" color="onScrim">
                    {t('camera.details.title')}
                  </AppText>
                  <AppText variant="caption" color="onScrim">
                    {t('camera.details.hands', { fps: Math.round(stats.fps) })}
                    {stats.model ? ` · ${t(`camera.details.model_${stats.model}`)}` : ''}
                    {stats.workers !== undefined
                      ? ` · ${stats.workers > 0 ? t('camera.details.workers', { count: stats.workers }) : t('camera.details.mainThread')}`
                      : ''}
                  </AppText>
                  {stats.bodyFps !== undefined ? (
                    <AppText variant="caption" color="onScrim">
                      {t('camera.details.body', { fps: Math.round(stats.bodyFps) })}
                    </AppText>
                  ) : null}
                  {stats.delegate ? (
                    <AppText variant="caption" color="onScrim">
                      {t('camera.details.runsOn', { delegate: stats.delegate })}
                    </AppText>
                  ) : null}
                  {stats.note ? (
                    <AppText variant="caption" color="onScrim" style={styles.note} selectable>
                      {stats.note}
                    </AppText>
                  ) : null}
                </View>
              ) : null}
              <PressableScale
                testID="tracking-rate"
                accessibilityRole="button"
                accessibilityLabel={t(showDetails ? 'camera.details.hide' : 'camera.details.show')}
                accessibilityState={{ expanded: showDetails }}
                onPress={() => setShowDetails((open) => !open)}
                hitSlop={8}
                style={[styles.rate, { backgroundColor: colors.scrim, borderRadius: radii.pill }]}
              >
                <AppText variant="caption" color="onScrim" style={styles.rateText}>
                  {t('camera.rate', { fps: Math.round(stats.fps), delegate: stats.delegate ?? '' })}
                </AppText>
              </PressableScale>
            </>
          ) : null}
        </>
      ) : (
        <View
          testID={error ? 'camera-error' : 'camera-loading'}
          accessible
          accessibilityLiveRegion="polite"
          style={[styles.center, styles.cover, { padding: spacing.xl, gap: spacing.md, backgroundColor: colors.scrim }]}
        >
          {error ? (
            <Icon name="camera-off-outline" size={40} color={colors.onScrim} />
          ) : status === 'paused' ? (
            <Icon name="pause-circle-outline" size={40} color={colors.onScrim} />
          ) : (
            <ActivityIndicator size="large" color={colors.accent} />
          )}
          <AppText variant="bodyStrong" color="onScrim" style={styles.text}>
            {error
              ? t(`camera.errors.${error}`)
              : status === 'downloading'
                ? t('camera.status.downloading', { percent: Math.round((progress ?? 0) * 100) })
                : t(`camera.status.${status}`)}
          </AppText>
          {status === 'downloading' && !error ? (
            <View style={[styles.progressTrack, { borderRadius: radii.pill }]}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round((progress ?? 0) * 100)}%`, backgroundColor: colors.accent, borderRadius: radii.pill },
                ]}
              />
            </View>
          ) : null}
          {error ? (
            <Button
              testID="camera-retry"
              size="sm"
              variant="secondary"
              icon="refresh"
              label={t('common.retry')}
              onPress={() => {
                setError(null);
                update('loading');
                setAttempt((n) => n + 1);
              }}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', overflow: 'hidden' },
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', gap: 8, alignItems: 'center' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  text: { textAlign: 'center' },
  progressTrack: { width: '70%', height: 6, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  progressFill: { height: 6 },
  rate: { position: 'absolute', left: 14, top: 58, paddingHorizontal: 10, paddingVertical: 4 },
  details: { position: 'absolute', left: 12, right: 12, top: 90 },
  note: { opacity: 0.8, fontSize: 11, lineHeight: 15 },
  rateText: { fontSize: 11, lineHeight: 15 },
});
