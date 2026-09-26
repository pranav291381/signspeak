import shared from '../../../../shared/feature_spec_v1.json';
import {
  FEATURE_SPEC_VERSION,
  FRAME_DIM,
  LEFT_HAND_START,
  POSE_LANDMARKS,
  POSE_PRESENT_INDEX,
  PRESENCE_START,
  RIGHT_HAND_START,
  TARGET_FPS,
  WINDOW_FRAMES,
} from '../featureSpec';

describe('feature contract', () => {
  it('matches the spec produced by the ML pipeline', () => {
    expect(FEATURE_SPEC_VERSION).toBe(shared.version);
    expect(FRAME_DIM).toBe(shared.frame_dim);
    expect(TARGET_FPS).toBe(shared.target_fps);
    expect(WINDOW_FRAMES).toBe(shared.window_frames);
    expect(POSE_PRESENT_INDEX).toBe(shared.layout.presence[0]);
    expect(shared.presence_flags[0]).toBe('pose_present');
    expect(POSE_LANDMARKS).toEqual(shared.pose_landmarks);
    expect(LEFT_HAND_START).toBe(shared.layout.left_hand[0]);
    expect(RIGHT_HAND_START).toBe(shared.layout.right_hand[0]);
    expect(PRESENCE_START).toBe(shared.layout.presence[0]);
  });
});
