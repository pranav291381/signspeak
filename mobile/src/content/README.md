# Sign library content

`data/signs.json` is the single source of sign content for Sign → Text (recognized label → text), Text → ISL (phrase lookup) and Learn ISL.

**Current state:** 58 *candidate concepts*. None has verified ISL content. Every entry has `media: null` and `verification.status: "unverified"`, so the app shows "Demonstration not available yet" everywhere and quizzes are unavailable. `library.test.ts` asserts this, so adding verified content is a deliberate change.

## Rules

1. **Do not invent ISL.** Glosses are conventional English labels for a single sign. Never describe how a sign is made in text. Multi-sign phrases have `gloss: null` until ISL educators supply the sign order.
2. An entry becomes `verified` only after review by a qualified ISL educator or fluent Deaf reviewer. It then needs:
   - `verification.reviewedBy`, `reviewedAt` and `source` (e.g. which ISL dictionary or educator), plus `region` for a regional variant
   - `media` with `uri`, `license` and `consentRef` (the signer's recorded consent for their video to appear in the app)
3. `validateLibrary()` (run by the tests) enforces all of this. Media on an unverified entry fails the build.
4. `meaning` and `phrases` must exist for every selectable UI language. Hindi entries are drafts and need native-speaker review.
5. The `id` is also the recognition label a model uses (see `docs/dataset.md` §5). Never rename an ID that a released model pack uses.

## Adding the first verified demonstrations

1. Record demonstrations with consent (`docs/dataset.md` §3, opt-in (b)).
2. Add the media to a checksummed media pack or bundle it as an asset. Keep large files out of git.
3. Implement playback in `DemonstrationView.tsx` (the verified branch). `expo-video` is the expected dependency. It is not installed yet because there is nothing to play.
4. Update the entry's `media` and `verification`, then update the assertion in `__tests__/library.test.ts`.
