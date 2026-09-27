import { engineAssetSources, engineHashes } from './assets';
import { ENGINE_HTML } from './engineHtml.generated';
import type { EngineConfig, EngineFacing } from './protocol';

/** Upper limit on hand detections per second (drawing runs at the display rate). */
export const ENGINE_TARGET_FPS = 30;

export function engineConfig(options: {
  facing: EngineFacing;
  active: boolean;
  platform: string;
  origin?: string;
  reduceMotion?: boolean;
}): EngineConfig {
  return {
    facing: options.facing,
    active: options.active,
    targetFps: ENGINE_TARGET_FPS,
    sources: engineAssetSources(options.platform, options.origin),
    hashes: engineHashes(),
    showLandmarks: true,
    reduceMotion: options.reduceMotion ?? false,
    mirrorUnknown: options.platform === 'web',
  };
}

/**
 * The engine may only connect to the hosts that serve its files (plus blob:
 * URLs it creates itself). This also blocks the usage telemetry that MediaPipe
 * Tasks sends to Google by default, which has no off switch.
 */
export function engineContentSecurityPolicy(config: EngineConfig): string {
  const origins = new Set<string>();
  for (const source of config.sources) {
    for (const url of [source.wasmBase, source.handModelUrl, source.poseModelUrl]) {
      try {
        const { origin, protocol } = new URL(url);
        if (protocol === 'https:' || protocol === 'http:') origins.add(origin);
      } catch {
        // Not a URL: nothing to allow.
      }
    }
  }
  return `connect-src 'self' blob: ${[...origins].join(' ')}`.trim();
}

/** The engine page with its configuration embedded (safe to inline in a <script>). */
export function buildEngineHtml(config: EngineConfig): string {
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  const csp = engineContentSecurityPolicy(config).replace(/[^\w\s:/.'*-]/g, '');
  return ENGINE_HTML.replace('/*ENGINE_CSP*/', () => csp).replace('/*ENGINE_CONFIG*/null', () => json);
}
