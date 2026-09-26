import { engineAssetSources, engineHashes } from './assets';
import { ENGINE_HTML } from './engineHtml.generated';
import type { EngineConfig, EngineFacing } from './protocol';

export const ENGINE_TARGET_FPS = 15;

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
  };
}

/** The engine page with its configuration embedded (safe to inline in a <script>). */
export function buildEngineHtml(config: EngineConfig): string {
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  return ENGINE_HTML.replace('/*ENGINE_CONFIG*/null', () => json);
}
