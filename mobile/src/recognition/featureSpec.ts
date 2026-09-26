/**
 * Mobile side of the landmark feature contract (shared/feature_spec_v1.json).
 * A test compares these constants with the shared file so the app and the
 * training pipeline cannot silently disagree.
 */
export const FEATURE_SPEC_VERSION = 1;
export const FRAME_DIM = 156;
export const TARGET_FPS = 15;
export const WINDOW_FRAMES = 32;

/** Index of the "pose present" flag; a frame with this at 0 means "no signer". */
export const POSE_PRESENT_INDEX = 153;
