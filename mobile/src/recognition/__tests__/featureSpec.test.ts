import shared from '../../../../shared/feature_spec_v1.json';
import { FEATURE_SPEC_VERSION, FRAME_DIM, POSE_PRESENT_INDEX, TARGET_FPS, WINDOW_FRAMES } from '../featureSpec';

describe('feature contract', () => {
  it('matches the spec produced by the ML pipeline', () => {
    expect(FEATURE_SPEC_VERSION).toBe(shared.version);
    expect(FRAME_DIM).toBe(shared.frame_dim);
    expect(TARGET_FPS).toBe(shared.target_fps);
    expect(WINDOW_FRAMES).toBe(shared.window_frames);
    expect(POSE_PRESENT_INDEX).toBe(shared.layout.presence[0]);
    expect(shared.presence_flags[0]).toBe('pose_present');
  });
});
