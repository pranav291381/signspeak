# Sign library content

`data/signs.json` lists the sign *concepts* the app knows by name: their IDs, meanings and the phrases that find them, in English and Hindi. It is used by the teach chooser (common words), by Sign → Text (a taught sign linked to a concept is shown in the output language) and by Text → ISL (phrases → concepts).

**Current state:** 58 *candidate concepts*. None has verified ISL content: every entry has `media: null` and `verification.status: "unverified"`. `library.test.ts` asserts this, so adding verified content is a deliberate change.

What a sign looks like is never stored here. Diagrams come only from recordings made on the phone (`src/personal/`), so nothing in the app invents a handshape.

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
3. Decide how to show it: as a video (e.g. `expo-video`, not installed yet) or as a reviewed landmark recording played by `src/diagram/SignDiagram.tsx`, the same format as taught signs.
4. Update the entry's `media` and `verification`, then update the assertion in `__tests__/library.test.ts`.
