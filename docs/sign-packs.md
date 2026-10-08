# Sign packs

A **sign pack** is the vocabulary Sign → Text recognizes: one or more reference recordings per sign, reduced to hand and body landmark numbers (no images, no video). Packs are made from sign videos **you have the right to use**: recordings made for the app by consenting signers, or videos whose owners have given permission. The app includes one pack: `include`, a trained model for the 262 signs of the INCLUDE dataset (see [The included pack](#the-included-pack)). Text → ISL uses a pack of the same format with one cleaned recording of each INCLUDE sign (see [Motion pack for Text → ISL](#motion-pack-for-text--isl)). The ISL dictionary at indiansignlanguage.org (videos on the YouTube channel "Indian Sign Language RKMVU-CBE") was considered, but its owners have not given permission, so it is not used. YouTube's terms do not allow downloading videos from YouTube.

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
       "permission": "Recorded for SignSpeak by consenting signers (2026)."
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
     --source-url https://example.org/ --permission "Recorded for SignSpeak by consenting signers (2026)."
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

   This copies the pack to `mobile/assets/signpacks/` and updates `mobile/src/signpack/bundled.ts`. The app reads packs when Sign → Text is first opened, and shows "Sign vocabulary not installed yet" when there is none. When a model pack is installed, Sign → Text uses the model.

## Test accuracy on unseen signers

Keep some videos out of the pack, ideally of **other signers**, and test with them:

```bash
npm run eval:signpack -- --pack build/deaf-club-2026.signpack --manifest test.json
```

`test.json` lists videos like the build manifest. Each video is analysed with the app's tracking and played, frame by frame at 15 fps, into **the same recognition session as Sign → Text** (window, stride, stabilizer). The result says how often the app showed the right sign, a wrong sign, or "not sure". Videos of signs that are not in the pack check that unknown signs are not shown as known ones. It also reports distances to the right sign and to the closest wrong sign, relative to the acceptance distance: the evidence for setting `--threshold` when building. Details go to `<pack>.eval.json`.

## Trained models

With several videos per sign from several signers, a trained model recognizes new people far better than matching recordings (see `docs/architecture.md` §6.5). The app's models read a **whole sign**: the camera screen waits until the hands come down, then recognizes everything signed since they rose (`mode: "segment"`, pack version 2). Several small networks are averaged (`members`).

```bash
# in mobile/: videos → hand positions
npm run export:landmarks -- --manifest videos.json --out landmarks.jsonl
# in ml/: run A, trained on the training recordings; writes build/a/my-model.signpack and report.json
python scripts/train_segments.py --data landmarks.jsonl --out build/a \
  --id my-model --name "…" --source-name "…" --source-url "…" --permission "…"
# in ml/: run B, also trained on the validation recordings, still tested on the test ones
python scripts/train_segments.py --data landmarks.jsonl --out build/b --train-val --temperature <run A's> --id my-model …
# in ml/: the model to ship, trained on every recording
python scripts/train_segments.py --data landmarks.jsonl --out build/final --train-all \
  --temperature <run A's> --evaluation-from build/b/report.json --id my-model …
# in mobile/: when to show a sign, chosen on the validation recordings with run A, written into all three packs
npm run tune:model -- --pack build/a/my-model.signpack --data landmarks.jsonl --write \
  --also build/b/my-model.signpack --also build/final/my-model.signpack
# in mobile/: accuracy on the test recordings, live, with those settings
npm run tune:model -- --pack build/b/my-model.signpack --data landmarks.jsonl --split test --evaluate --details test.json
npm run install:signpack -- build/final/my-model.signpack
```

Give each video in `videos.json` a `group` (who signed it, or the recording session): for each sign the last group is held out for testing and the one before for validation.

- **Members.** `--members` lists the networks as `arch:features:seed`: `gru` (convolutions and a bidirectional GRU) or `tf` (a small transformer); `xy` (hand and arm positions) or `xy+hands+vel` (also each hand's shape relative to its wrist, and how every point moved). Their logits are averaged; networks that read different things make different mistakes.
- **When a sign is shown.** `tune:model` plays the validation recordings through the app's own recognition session and tries settings for how sure the model must be (confidence, lead over the next sign). It keeps the one that shows the right sign most often while showing a wrong sign for at most 5% of recordings (`--max-wrong`), and stores it in the pack. When the model is less sure, the app shows its three likeliest signs as “Did you mean…?”; `tune:model` reports how often the right one is among them.
- **Depth.** `npm run export:landmarks -- --depth` keeps each point's depth (x, y, z: 156 values per frame) instead of x and y only, for experiments with depth; the included model does not use it.
- **Measuring.** `--evaluate` measures the pack's own settings instead of choosing new ones (use it on `--split test`); `--details` writes each recording's result. To see a slower phone's view, analyse the test videos with the lighter hand model that such phones switch to (`npm run export:landmarks -- --hand-model lite …`) and measure on that file with `--split all`.
- **The shipped model.** `--train-all` trains on every recording (no held-out data) with the held-out runs' settings, which is what the accuracy figures describe. Its calibration is never claimed.
- **Older packs.** Version-1 packs (one network reading the last 32 frames, `scripts/train_from_landmarks.py`) still load.

## The included pack

`mobile/assets/signpacks/include.signpack` (6.6 MB) is a whole-sign model (three networks: two GRUs and a transformer) for all 262 signs of [INCLUDE](https://zenodo.org/records/4010759) (AI4Bharat / IIT Madras, ACM Multimedia 2020; CC BY 4.0; signed by Deaf students of St. Louis School for the Deaf, Chennai). It holds only model weights, labels and the source's name, licence and changes; no video and no landmark recordings.

How it was made: all 4,276 INCLUDE videos were analysed with `npm run export:landmarks` (1280 px wide), grouped by recording session (three takes each). Sign names were tidied for display only ("Ex. Monsoon" → "Monsoon", "big large" → "Big / large", capital first letter). For each sign the last session was held out for testing and the one before for validation. Run A (`train_segments.py`) trained on the rest; its temperature was fitted and `tune:model` chose when to show a sign on the validation videos (confidence 0.8, no margin). Run B also trained on the validation videos and was measured on the test ones with run A's settings. The shipped model was trained on every recording with the same settings (`--train-all`).

| Test (730 held-out videos, run B) | Result |
| --- | --- |
| Model alone, one prediction per video | 83% right sign, 93% in the top 3, 96% in the top 5 (run A, without the validation videos: 78%, 90%, 92%) |
| Live, `npm run tune:model -- --evaluate --split test` (played into the app's session with rest before and after) | 64% right on the first try, 5% wrong, 31% "not sure" |
| Right sign on screen, shown or offered for one tap (“Did you mean…?”, “Not right?”) | 92% |
| A signer the model never saw: [ISL Bible dictionary](https://huggingface.co/datasets/bridgeconn/sign-dictionary-isl) of Bridge Connectivity Solutions (CC BY-SA 4.0), 197 videos of 156 signs, shipped model | 15% right on the first try, 15% wrong, 70% "not sure"; right sign on screen 36%; model alone 25% right, 38% in the top 3 |
| Slow phones (lite hand model), one test video per sign | 64% right on the first try, 5% wrong, right sign on screen 92% (the same 260 videos with the full model: 68%, 4%, 94%) |
| Signs | 176 right on at least two thirds of their test videos, 30 sometimes, 45 never shown on their own but offered for one tap, 9 not yet, 2 not tested |

Every sign and its result: [`include-signs.md`](include-signs.md). Limits: recording sessions may share signers and all signers come from one school, so the INCLUDE figures overstate accuracy for new signers, as the dictionary signer shows (some of their signs may be regional variants, or a different sense of the same English word; the dictionary was matched to INCLUDE by English word only); calibration is not verified (ECE 0.06 on the test videos, but not checked on other signers), so the app shows no confidence level with the result. It has not been tried by users yet. The previous model (one network reading the last 2 seconds, 32% right live) is replaced.

## Motion pack for Text → ISL

`mobile/assets/motions/include-motion.signpack` (2.2 MB) is what Text → ISL plays: for each of the 262 INCLUDE signs, one recording reduced to hand and body landmarks (no video, no face). It is a sign pack in the format below, but it is not installed as recognition vocabulary: it is listed in `mobile/src/motion/bundled.ts` and read only by Text → ISL.

Build it from the same landmarks file as the model:

```bash
# in mobile/
npm run build:motions -- --data landmarks.jsonl --out assets/motions/include-motion.signpack \
  --id include-motion --name "INCLUDE signs" \
  --source-name "INCLUDE dataset, AI4Bharat / IIT Madras (Sridhar, Ganesan, Kumar, Khapra 2020)" \
  --source-url "https://zenodo.org/records/4010759" \
  --permission "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Signed by Deaf students of St. Louis School for the Deaf, Chennai. Changed: one recording per sign reduced to hand and body landmarks, short hand-tracking gaps filled along the tracked wrist, smoothed and trimmed."
```

It writes the pack and `<out>.report.json` (for each sign, the recording chosen, how many there were, and how much of the sign the hand tracker saw) and names the signs where hands were lost for over 30% of the sign, to check by eye. The report is not committed.

- **Which recording.** Among a sign's recordings, those in which the hand tracker lost the hands least during the sign itself (the rise from rest blurs and does not count); of those, the most typical: the smallest median distance (the app's DTW) to the sign's other recordings. So an unusual take or a badly tracked one is not shown.
- **Cleaning for display** (`mobile/src/motion/clean.ts`). The hand tracker loses hands in fast movement while the pose tracker still sees the wrist. A hand lost for up to 10 frames (0.67 s) is placed where its wrist was seen, with its shape blended between the frames before and after; up to 6 frames past where it was last seen it follows the wrist. Nothing is added where neither tracker saw it. A short temporal filter removes jitter (3 frames for hands, 5 for the body). Rest is trimmed to 4 frames before and after the signing. On INCLUDE the chosen recordings had the hands in view for 90% of the sign on average before filling; 15 signs had them for 47–70%.
- **Limits.** One signer's version of each sign; signs differ between regions and signers. Facial expressions and mouthing are not in the landmarks. Tracking errors that last longer than a gap, or a hand misread, stay visible: now and then a finger or an arm may be out of place. The pack has not been reviewed by ISL educators; the app says where the signs come from and what is not shown.

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
- A pack contains landmark numbers derived from the source's videos, the name of the source, its URL and the permission statement. The app names the source on the Sign → Text and Text → ISL screens and in Settings → About.
- Test packs made from anything other than real ISL signs (for example `mobile/src/test-utils/packs.ts`, or the stand-in videos used to test the builder) must never be installed in a release build.
