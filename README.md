# SignSpeak

A mobile app to help people communicate using **Indian Sign Language (ISL)**, built with and for Deaf ISL users, their families, and the hearing people they meet every day.

> **Honest status.**
> - **Sign → Text knows the 262 signs of the [INCLUDE dataset](https://zenodo.org/records/4010759)** (everyday ISL words: greetings, people, colours, days, places, jobs and more; CC BY 4.0, signed by Deaf students), with a model trained on INCLUDE's 4,276 videos. Played live into the app, videos from recording sessions the model never saw gave **the right sign on the first try 64% of the time**, a wrong sign 5%, and "not sure" 31%. When it is not sure it offers its three likeliest signs (“Did you mean…?”), and under a shown sign the next two (“Not right?”): counting those, **the right sign was on screen, shown or one tap away, for 92%** of the videos. 176 signs were right on at least two thirds of their test videos. The full list is in [`docs/include-signs.md`](docs/include-signs.md). The app is tuned to say "not sure" rather than show a wrong sign, and marks a sign picked from its suggestions as chosen, not recognized. It has not been tested with users yet. **These figures are for INCLUDE's own signers.** On a signer the model never saw (the [ISL Bible dictionary](https://huggingface.co/datasets/bridgeconn/sign-dictionary-isl) of Bridge Connectivity Solutions, CC BY-SA 4.0, with 197 videos of 156 of the 262 signs, used only for testing), the right sign came first 15% of the time, a wrong sign 15%, and the right sign was on screen 36%. Some of that gap may be regional variants, or a different sense of the same English word, but people who did not learn their signs alongside INCLUDE's signers should expect most signs not to be recognized yet. Recognizing new signers needs recordings of each sign from many signers.
> - More vocabulary can be added as sign packs, built from sign videos by a converter that runs the app's own hand tracking, from videos we have the right to use (public licences such as INCLUDE's, recordings by consenting signers, or videos whose owners give permission).
> - **Text → ISL shows the same 262 signs**: type English words or a sentence and watch each word signed, one after another, as a moving hand-and-body figure traced from a real INCLUDE recording, with a still diagram of each sign. Words not among the 262 are listed as missing, never guessed. It shows signs word by word in the order typed; it does not translate into ISL grammar, and facial expressions are not shown.
> - **Teach the app your signs.** Any of the 262 signs can be taught the way you sign it (two or three takes, stored only on the phone as hand and arm positions), as well as your own words and letters. In a test where the same person taught each sign with two takes and then signed it again, the right sign came first 82% of the time instead of 65% (wrong 4% instead of 5%). It helps only the person who taught, signing as they taught; for someone else it makes no difference.
> - Learn is **parked** (the code is kept). The app ships no invented ISL content.
> - The Hindi interface is a draft awaiting native-speaker review.
>
> SignSpeak is **not** a replacement for qualified ISL interpreters.

## What is in the app

| | |
| --- | --- |
| **First launch** | Choose the app language and a light, dark or system look, then a short "how it works" |
| **Sign → Text** | Camera, text and speech. Live on-device hand and body tracking: both hands, the body (shoulders, arms, torso) and a simple face (head, eyes, nose, mouth) drawn as a skeleton over the video, smooth at the screen's refresh rate. Tracking runs in background workers; on slow phones it uses MediaPipe's lite hand model and several workers at once (a small label shows the rate; tap it for details). Tells you at once whether hands are in view. Recognizes the signs of the installed vocabulary, joins fingerspelled letters into words, speaks the result, never guesses. Says how many signs it knows and where they come from. Pause, switch camera, clear, report a wrong result |
| **Sign packs** | `npm run build:signpack` turns sign videos (a manifest of word + video) into a vocabulary pack with the app's own tracking; `npm run install:signpack` adds it to the app. See [`docs/sign-packs.md`](docs/sign-packs.md) |
| **Teach a sign / My signs** | **Parked** (owner's decision): no entry point, code kept. Signs taught earlier can be deleted in Settings |
| **Text → ISL** | Type English words or a sentence; each word with a sign plays as one smooth movement, sign after sign (a figure with coloured fingers, traced from an INCLUDE recording of Deaf signers), with the sign's name above it. Words as chips to jump between; play/pause, previous/next, speed (0.5×, 0.75×, 1×), mirror image, repeat. A still diagram of every sign (start faded, end solid, arrows for how the hands move); tap one to play it there. Plurals and verb forms find their sign ("teachers" → Teacher), suggestions complete a word as you type, and all 262 signs can be browsed by group. Words with no sign are listed, not guessed. With "reduce motion" on, nothing moves until Play is pressed |
| **Learn** | **In progress** (parked). The alphabet map and tips are kept in `features/learn` |
| **Your signs** | Teach any sign the app knows the way you sign it, or your own words and the alphabet: a countdown, a few seconds of hand and arm positions (no video), two or three takes, a replay of each. From Home, Settings, or “Teach it your way” under a sign you picked from the suggestions. Stored only on this phone |
| **Settings** | Appearance, app and output languages (separate), speech, camera, history (off by default), haptics, demo mode, your signs, report a problem, about (limitations) |
| **Privacy** | Video never leaves the phone and is never saved. Sign packs hold only landmark numbers; the source videos stay on the computer that builds the pack |
| **ML pipeline** (`ml/`) | For a future general model: feature contract shared with the app, MediaPipe extraction, signer-level splits, temporal model, training, calibration, evaluation, checksummed model packs |
| **Backend** (`backend/`, optional) | Feedback collection and a landmark-only recognition endpoint. Stores no IP addresses or device IDs |

## Try it

You need Node.js 22 and the repository cloned.

```bash
cd mobile
npm ci          # also downloads the hand-tracking files for the web build
```

**On a laptop (web):** `npm run web`, then open http://localhost:8081 in Chrome, Edge or Safari. Allow the camera when asked. The first start loads hand tracking (about 25 MB, cached afterwards).

**On a phone (Expo Go):** install *Expo Go* from the Play Store or App Store, run `npm start` on a computer on the same Wi-Fi, and scan the QR code. The first time you open Sign → Text, the phone downloads hand tracking once (internet needed).

### How to use it

1. **Sign → Text.** Point the camera at the signer: head, shoulders and hands in view, in good light. Recognized signs appear as text; press Speak to hear them.
2. Start with your hands down, sign one of the INCLUDE signs (the ones marked "works" in [`docs/include-signs.md`](docs/include-signs.md) are the best to try), then lower your hands. The word appears when the sign is finished. If it says "not sure", try again with your whole upper body and both hands in view.
3. **Text → ISL.** Type English words or a sentence ("Good morning, how are you?") and press Show signs. Tap a word to jump to it, or a still diagram below to play that sign on its own. Words without a sign are shown with a dashed outline.
4. **If it keeps missing a sign of yours**, pick the right one from “Did you mean…?” and tap “Teach it your way”, or open Your signs from Home: record the sign two or three times, the way you sign it.
5. To build and install a pack yourself (on a PC with Chrome or Edge): see [`docs/sign-packs.md`](docs/sign-packs.md).

## How recognition works

Hand and pose tracking (MediaPipe) runs on the phone inside the app's camera engine and produces body-centred hand and arm positions, about 15 times a second. Each sign of the vocabulary is a recording of those positions, made from a sign video by the **same** tracking code. Live signing is compared with the recordings by dynamic time warping, which tolerates different speeds, and is also compared mirrored so left-handed signers match. With thousands of signs, a fast first pass picks the 24 closest and only those are compared in full. Hands resting low (on the lap) are ignored. The stabilizer only shows a sign after several agreeing, confident, unambiguous predictions; otherwise it says it is not sure. Details: [`docs/architecture.md`](docs/architecture.md) §6.6–6.8.

Tested with synthetic landmark sequences (speed, position, noise, left-handed signers, mislabeled hands, resting and held hands, 250–2,000 signs), with **real MediaPipe output** from the app's engine on MediaPipe's own hand photos, and end to end in a browser: stand-in videos were turned into a pack by the converter, installed in the web app, and each was recognized live from a fake camera playing the same video. These stand-ins are not ISL.

**Trained models.** Matching recordings works for signs recorded by the user but recognizes other signers poorly (28% on INCLUDE's greetings). When a trained model is installed, as now, Sign → Text uses it instead. It waits until the hands come down, then reads the whole sign at once with three small networks (two GRUs and a transformer, run in the app's JavaScript) and averages their answers. When it is sure, it shows the sign, with the next two likeliest under “Not right?”. When it is not sure, it says so and offers its three likeliest signs as “Did you mean…?”. A sign picked there is marked as chosen, never as recognized. It is trained from landmark recordings made by the same tracking code (`npm run export:landmarks`, then `ml/scripts/train_segments.py`), and tested by playing held-out recordings frame by frame into the same recognition session as the camera screen (`npm run tune:model -- --evaluate`). Details: [`docs/sign-packs.md`](docs/sign-packs.md), [`docs/architecture.md`](docs/architecture.md) §6.5a.

## Limitations

- Recognizes INCLUDE's 262 signs as INCLUDE's signers (Deaf students of one school in Chennai) sign them: right on the first try for about two thirds of held-out videos of those signers, but only 15% for a signer it never saw (36% on screen); regional variants and other signing styles may not be recognized. It has **not** been tested with users, and "100%" accuracy cannot be promised by any recognizer. Better accuracy needs more signers per sign (testers' recordings, other datasets).
- Teaching your own signs helps you, signing the way you taught: in a same-session test, 82% right on the first try instead of 65%. It does not help with other people's signing. It is not a substitute for recordings of many signers.
- Signs that differ only in facial expression or mouthing cannot be told apart (face landmarks are not used yet).
- Hands, head and shoulders must be in view (the tracker normalizes by shoulder width). On slow phones the lite hand model is used; the sign model was trained on the full model's landmarks, and with the lite one it got about 5 points fewer signs right on the first try (one test video per sign: 64% against 68%; right sign on screen 92% against 94%). Fast fingerspelling is too quick: spell slowly, about one letter per second.
- Text → ISL is sign by sign in the order typed, not translation: ISL grammar and word order are not modelled, and facial expressions and mouthing, which carry meaning in ISL, are not shown. It covers only the 262 INCLUDE signs, each as one signer made it (signs can differ between regions), traced from video: now and then a finger may be out of place.
- Not yet tested on physical phones in this environment: camera access inside the WebView on specific Android/iOS versions, the tracking rate reached on real low-end phones (in a 4-core browser test, hands went from 6 to about 19 results a second), matching speed with a large vocabulary (phones run JavaScript without a JIT), battery, TalkBack/VoiceOver.

## Repository layout

```
mobile/    Expo (SDK 57) React Native app, TypeScript
  engine/  Camera engine page (MediaPipe), bundled into the app by scripts/build-engine.mjs
ml/        Python package signspeak_ml: features, data, model, training, evaluation, inference
backend/   Optional FastAPI service: feedback + landmark-only recognition
shared/    Contracts shared by ML and mobile (feature_spec_v1.json, parity fixtures)
docs/      Product, architecture, privacy, dataset, evaluation, pilot, security review
```

## Development

```bash
# Mobile
cd mobile && npm ci
npm run start            # Expo dev server
npm test && npm run typecheck && npm run lint
npm run check:engine     # the bundled camera engine matches engine/*.ts (npm run build:engine to update)
npm run build:signpack -- --manifest <file.json> --out build/<id>.signpack   # videos → sign pack
npm run install:signpack -- build/<id>.signpack                               # add it to the app

# ML
cd ml && python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"  # add ".[mediapipe]" for video landmark extraction
pytest

# Backend (optional)
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]" && pytest
uvicorn signspeak_api.main:app --reload
```

Configuration uses environment variables only. See [`.env.example`](.env.example). CI (`.github/workflows/ci.yml`) runs all three test suites, lint, typecheck, a dependency audit and a check that no datasets, recordings, weights or secrets are committed.

## ML and dataset setup (general model, future)

1. Collect a consented, signer-diverse dataset following [`docs/dataset.md`](docs/dataset.md). Mount it outside git (`SIGNSPEAK_DATASET_ROOT`).
2. `signspeak-ml validate-annotations`, then `make-splits` (signer-level), then `extract-features`, then `train`.
3. Check the model against [`docs/model-evaluation.md`](docs/model-evaluation.md) release criteria before it is added alongside personal signs.

See [`ml/README.md`](ml/README.md).

## Documentation

| Document | Contents |
| --- | --- |
| [product-spec.md](docs/product-spec.md) | Users, features, responsible-AI rules, accessibility requirements |
| [architecture.md](docs/architecture.md) | System design, recognition, camera engine, interfaces, decision log |
| [development-plan.md](docs/development-plan.md) | Phase status, test inventory, what needs people or decisions |
| [privacy.md](docs/privacy.md) | Data inventory, storage, retention, deletion |
| [security-review.md](docs/security-review.md) | Review results and accepted risks |
| [dataset.md](docs/dataset.md) | Consent, annotation format, anonymization, splits, licensing, versioning |
| [model-evaluation.md](docs/model-evaluation.md) | Metrics, calibration, release criteria, model cards |
| [pilot.md](docs/pilot.md) | NGO pilot preparation, feedback collection, accessibility prompts |
| [sign-packs.md](docs/sign-packs.md) | Building, installing and calibrating sign vocabularies from sign videos |
| [include-signs.md](docs/include-signs.md) | Every INCLUDE sign in the app and how it did on held-out recordings |
| [contributing.md](docs/contributing.md) | Conventions, PR and accessibility checklists, adding languages and content |

## Contributing

Read [`docs/contributing.md`](docs/contributing.md). In short: do not invent ISL content, never overclaim accuracy, localize every string, keep data out of git, and treat accessibility as a requirement.

## Decisions waiting for the repository owner

- **License** for code and content (none chosen yet)
- **Sign videos the project may use**: recordings by consenting fluent signers (for example with a Deaf association or ISL teachers), or permission from a dictionary's owners
- **Testers** to sign known words, so recognition of other signers can be measured and calibrated
- **How to ship a large dictionary pack**: inside the app (now) or downloaded on first use, once its size is known
- **App identifier, Expo account and store listing** for production builds

## Credits

Sign → Text's model is trained on the **INCLUDE** dataset: A. Sridhar, R. G. Ganesan, P. Kumar, M. Khapra, "INCLUDE: A Large Scale Dataset for Indian Sign Language Recognition", ACM Multimedia 2020. AI4Bharat / IIT Madras, [zenodo.org/records/4010759](https://zenodo.org/records/4010759), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Signed by Deaf students of St. Louis School for the Deaf, Chennai. Changes: the videos were reduced to hand and body landmarks, which were used to train the model; no video is included.

The accuracy test on a signer the model never saw uses the **ISL Bible (ISLV) Dictionary** by Bridge Connectivity Solutions Pvt. Ltd., [huggingface.co/datasets/bridgeconn/sign-dictionary-isl](https://huggingface.co/datasets/bridgeconn/sign-dictionary-isl), licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). It was used for testing only: nothing from it is in the app or in this repository.

## License

No license has been chosen yet. That is the repository owner's decision.
