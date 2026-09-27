/**
 * Mobile side of the landmark feature contract (shared/feature_spec_v1.json).
 * A test compares these constants with the shared file so the app and the
 * training pipeline cannot silently disagree.
 */
export const FEATURE_SPEC_VERSION = 1;
export const FRAME_DIM = 156;
export const TARGET_FPS = 15;
export const WINDOW_FRAMES = 32;

/** MediaPipe Pose indices used, in vector order. */
export const POSE_LANDMARKS = {
  nose: 0,
  left_shoulder: 11,
  right_shoulder: 12,
  left_elbow: 13,
  right_elbow: 14,
  left_wrist: 15,
  right_wrist: 16,
  left_hip: 23,
  right_hip: 24,
} as const;

export const HAND_LANDMARK_COUNT = 21;
export const COORDS = 3;

export const POSE_START = 0;
export const LEFT_HAND_START = 27;
export const RIGHT_HAND_START = 90;
export const PRESENCE_START = 153;

/** Index of the "pose present" flag; a frame with this at 0 means "no signer". */
export const POSE_PRESENT_INDEX = PRESENCE_START;
export const LEFT_HAND_PRESENT_INDEX = PRESENCE_START + 1;
export const RIGHT_HAND_PRESENT_INDEX = PRESENCE_START + 2;

export const MIN_SHOULDER_WIDTH = 1e-3;
