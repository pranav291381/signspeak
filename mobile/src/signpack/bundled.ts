// Sign packs shipped with the app, in assets/signpacks/.
// Written by `npm run install:signpack`; do not edit by hand.
/* eslint-disable @typescript-eslint/no-require-imports -- Metro bundles assets through require() */

export interface BundledSignPack {
  id: string;
  /** require() of the .signpack asset. */
  asset: number;
}

export const BUNDLED_SIGN_PACKS: readonly BundledSignPack[] = [
  { id: 'include-greet', asset: require('../../assets/signpacks/include-greet.signpack') },
];
