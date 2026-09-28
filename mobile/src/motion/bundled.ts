/* eslint-disable @typescript-eslint/no-require-imports -- Metro bundles assets through require() */

/**
 * Motion packs shipped with the app, in assets/motions/ (sign pack format,
 * one cleaned recording per sign). Made by `npm run build:motions`; see
 * docs/sign-packs.md.
 */
export interface BundledMotionPack {
  id: string;
  /** require() of the .signpack asset. */
  asset: number;
}

export const BUNDLED_MOTION_PACKS: readonly BundledMotionPack[] = [
  { id: 'include-motion', asset: require('../../assets/motions/include-motion.signpack') },
];
