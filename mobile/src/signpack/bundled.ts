// Sign packs shipped with the app, in assets/signpacks/.
// Written by `npm run install:signpack`; do not edit by hand.

export interface BundledSignPack {
  id: string;
  /** require() of the .signpack asset. */
  asset: number;
}

export const BUNDLED_SIGN_PACKS: readonly BundledSignPack[] = [];
