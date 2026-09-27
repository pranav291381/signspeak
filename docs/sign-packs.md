# Sign packs

A **sign pack** is the vocabulary Sign → Text recognizes: one or more reference recordings per sign, reduced to hand and body landmark numbers (no images, no video). Packs are made from sign videos **you have the right to use**: recordings made for the app by consenting signers, or videos whose owners have given permission. No pack is included yet. The ISL dictionary at indiansignlanguage.org (videos on the YouTube channel "Indian Sign Language RKMVU-CBE") was considered, but its owners have not given permission, so it is not used. YouTube's terms do not allow downloading videos from YouTube.

```
sign videos         ──►  npm run build:signpack  ──►  deaf-club-2026.signpack  ──►  npm run install:signpack  ──►  the app
                          (the app's own hand tracking,       (landmarks only)             (assets/signpacks/ +
                           run in Chrome/Edge on your PC)                                    src/signpack/bundled.ts)
```

## Build a pack

You need Node.js 22, the repository with `npm ci` done in `mobile/`, and Chrome or Edge.

1. Write a **manifest** listing the signs (JSON):

   ```json
   {
     "id": "deaf-club-2026",
     "name": "Deaf club recordings",
     "source": {
       "name": "Example Deaf Club",
       "url": "https://example.org/",
       "permission": "Recorded for ISL Connect by consenting signers (2026)."
     },
     "language": "en",
     "signs": [
       { "text": "hello", "video": "https://example.org/videos/hello.mp4", "sourceUrl": "https://example.org/hello/", "category": "Greetings" },
       { "text": "water", "video": "videos/water.mp4" }
     ]
   }
   ```

   - `id`: lowercase letters, digits and `-`. It prefixes every sign id (`deaf-club-2026:hello`).
   - `source.permission` is required. Do not build packs from videos you have no permission to use.
   - `text` is what the sign means, exactly as the source gives it. Videos with the same `text` become recordings of one sign (for example regional variants).
   - `video` is a URL or a path relative to the manifest. Optional: `sourceUrl` (the page showing the sign), `category`, and `letter: true` for fingerspelled letters.

   **From a folder of videos** (for example the video owner's export from YouTube Studio or Google Takeout, where each file is named by its video title), write the manifest with:

   ```bash
   npm run manifest:signpack -- <videos folder> --out vocabulary.json --id deaf-club-2026 \
     --name "Deaf club recordings" --source-name "Example Deaf Club" \
     --source-url https://example.org/ --permission "Recorded for ISL Connect by consenting signers (2026)."
   ```

   Each file name becomes the sign's meaning. Check them before building: titles often carry extra words ("Hello - ISL", "Hello (1)") to remove from `text`.

   **Videos on YouTube** must come from their owner. YouTube's terms do not allow downloading videos from YouTube, even with the website's permission. The channel owner can export their own videos (YouTube Studio, or Google Takeout for a whole channel) and share the files.

2. Run the builder from `mobile/`:

   ```bash
   npm run build:signpack -- --manifest vocabulary.json --out build/deaf-club-2026.signpack
   ```

   It downloads each video once into `mobile/.signpack-cache/`, with a pause between downloads (`--delay-ms`, default 500). It analyses each video frame by frame at 15 frames a second with **the app's own hand and body tracking** (`mobile/engine/extract.ts`, the same MediaPipe models and code as the camera screen). Then it writes the pack. If it stops, run it again: finished videos are not redone.

   | Option | Default | |
   | --- | --- | --- |
   | `--browser` | Chrome, then Edge, then Playwright's Chromium | `chrome`, `msedge`, `chromium` or a path to a browser |
   | `--ffmpeg` | `$FFMPEG` or `ffmpeg` | Only needed for videos the browser cannot play (converted to VP9 WebM). Chrome and Edge play MP4/H.264 themselves |
   | `--jobs` | 2 | Videos analysed at once |
   | `--limit` | all | Only the first *n* signs, for a trial run |
   | `--threshold` | 0.9 | Acceptance distance written into the pack (see Calibration) |
   | `--cache` | `mobile/.signpack-cache` | Where videos and per-video results are kept (git-ignored) |

3. Read the report `build/deaf-club-2026.signpack.report.json`. For every video it gives the number of frames with a person, with hands in view, and with hands raised to sign, or why the video was left out (for example "no_hands" or a download error). It also lists, for each sign, the three signs the recognizer finds closest to it. A distance at or below 1 means the two signs can be confused, which is worth checking in the source.

4. Install it in the app and rebuild:

   ```bash
   npm run install:signpack -- build/deaf-club-2026.signpack
   npm run install:signpack -- --list
   npm run install:signpack -- --remove deaf-club-2026
   ```

   This copies the pack to `mobile/assets/signpacks/` and updates `mobile/src/signpack/bundled.ts`. The app reads packs when Sign → Text is first opened, and shows "Sign vocabulary not installed yet" when there is none.

## Test accuracy on unseen signers

Keep some videos out of the pack, ideally of **other signers**, and test with them:

```bash
npm run eval:signpack -- --pack build/deaf-club-2026.signpack --manifest test.json
```

`test.json` lists videos like the build manifest. Each video is analysed with the app's tracking and played, frame by frame at 15 fps, into **the same recognition session as Sign → Text** (window, stride, stabilizer). The result says how often the app showed the right sign, a wrong sign, or "not sure". Videos of signs that are not in the pack check that unknown signs are not shown as known ones. It also reports distances to the right sign and to the closest wrong sign, relative to the acceptance distance: the evidence for setting `--threshold` when building. Details go to `<pack>.eval.json`.

## Trained models

With several videos per sign from several signers, a trained model recognizes new people far better than matching recordings (see `docs/architecture.md` §6.5):

```bash
npm run export:landmarks -- --manifest videos.json --out landmarks.jsonl     # in mobile/: videos → hand positions
python scripts/train_from_landmarks.py --data landmarks.jsonl --out build/model \
  --id my-model --name "…" --source-name "…" --source-url "…" --permission "…"   # in ml/
npm run eval:signpack -- --pack build/model/my-model.signpack --manifest test.json
npm run install:signpack -- build/model/my-model.signpack
```

Give each video in `videos.json` a `group` (who signed it, or the recording session): whole groups are held out for testing. A model pack is installed and loaded like a sign pack; when one is installed, Sign → Text uses it.

## Format

`islconnect-sign-pack`, version 1 (`mobile/src/signpack/types.ts`, checked by `parse.ts`):

```jsonc
{
  "format": "islconnect-sign-pack", "version": 1,
  "id": "deaf-club-2026", "name": "…",
  "featureSpecVersion": 1, "sampleFps": 15,
  "source": { "name": "…", "url": "…", "permission": "…" },
  "createdAt": "2026-09-27T…",
  "defaultThreshold": 0.9,
  "signs": [
    { "id": "deaf-club-2026:hello", "text": "hello", "language": "en", "sourceUrl": "…", "category": "…",
      "samples": [{ "frames": 24, "dim": 105, "data": "<base64>" }] }
  ]
}
```

A sample holds frames of feature spec v1 without depth (`dim` 105: x and y of every landmark, then the three presence flags), as Int16 × 1000, base64, the same codec as signs taught on the phone. Full frames (`dim` 156) are also accepted. The app rejects a pack of another format, feature version or frame rate, and leaves out single broken signs, counting them.

Size: about 7 KB per sign for a 1.5 s recording. A vocabulary of a few thousand signs is some tens of MB. If that is too large to ship inside the app, the pack can later be downloaded on first use like the hand-tracking files. That is a decision for the repository owner.

## How the app uses a pack

- Each sign's recording is compared with the last 3 seconds of live signing by the same matching as taught signs (compact hand features, subsequence DTW, mirrored for left-handed signers; `docs/architecture.md` §6.6).
- With many signs, a fast first pass picks the 24 closest signs and only those are compared in full (`mobile/src/personal/prefilter.ts`, §6.8). On a laptop browser this takes about 12–22 ms per prediction for 2,000 signs.
- A sign is shown only after several agreeing, unambiguous predictions. Otherwise the app says it is not sure.
- The text shown and spoken is the source's word, in the source's language (for example English). The screen says so when the app's output language is different.

## Calibration and limits

- **Few signers per sign.** If each sign is recorded once, by one signer, other people's signing may not match: people sign differently (speed, size, handshape details, which hand), and recognition of other signers has **not been measured yet**. Expect more "not sure" results than with signs taught by the user.
- **Acceptance distance.** With one recording per sign, how far a sign can drift and still count cannot be measured from repeats. Every sign uses the pack's `defaultThreshold` (0.9) until test videos are available: run `npm run eval:signpack` on videos of other signers and set `--threshold` from the distances it reports (`docs/model-evaluation.md`).
- **Look-alike signs.** Signs that differ only in facial expression, mouthing or small details the hand tracker cannot see will be confused or rejected. The report lists close pairs.
- **What the landmarks show.** Hand and upper-body landmarks only. Face landmarks, which carry grammar and some meanings in ISL, are not used yet.
- **Phones.** Matching runs in the app's JavaScript. It is fast in browsers; on phones without a JIT (Hermes) a large vocabulary may be slower, which has not been measured on a device yet.

## Privacy and provenance

- The builder downloads videos only to the computer that runs it (`.signpack-cache/`, git-ignored). Videos are never uploaded anywhere and never committed. CI rejects video files in the repository.
- A pack contains landmark numbers derived from the source's videos, the name of the source, its URL and the permission statement. The app names the source on the Sign → Text screen.
- Test packs made from anything other than real ISL signs (for example `mobile/src/test-utils/packs.ts`, or the stand-in videos used to test the builder) must never be installed in a release build.
