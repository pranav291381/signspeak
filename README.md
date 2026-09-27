# ISL Connect (`signspeak`)

A mobile app to help people communicate using **Indian Sign Language (ISL)**, built with and for Deaf ISL users, their families, and the hearing people they meet every day.

> **Honest status.**
> - **Sign → Text recognizes the signs of an installed sign vocabulary** ("sign pack"), built from sign videos by a converter that runs the app's own hand tracking on each video. The converter and the app side work and are tested, but **no vocabulary is included yet**: the videos must be ones we have the right to use (recordings by consenting signers, or videos whose owners give permission). Until one is installed, Sign → Text says "Sign vocabulary not installed yet".
> - How well a vocabulary recognizes signers other than those recorded has not been measured; that needs testers. The app says "not sure" rather than guessing.
> - Text → ISL, Learn and teaching your own signs are **parked** (the code is kept). The app ships no invented ISL content.
> - The Hindi interface is a draft awaiting native-speaker review.
>
> ISL Connect is **not** a replacement for qualified ISL interpreters.

## What is in the app

| | |
| --- | --- |
| **First launch** | Choose the app language and a light, dark or system look, then a short "how it works" |
| **Sign → Text** | Camera, text and speech. Live on-device hand and body tracking, both hands drawn as a skeleton over the video (smooth at the screen's refresh rate; a small label shows the tracking rate). Tells you at once whether hands are in view. Recognizes the signs of the installed vocabulary, joins fingerspelled letters into words, speaks the result, never guesses. Says how many signs it knows and where they come from. Pause, switch camera, clear, report a wrong result |
| **Sign packs** | `npm run build:signpack` turns sign videos (a manifest of word + video) into a vocabulary pack with the app's own tracking; `npm run install:signpack` adds it to the app. See [`docs/sign-packs.md`](docs/sign-packs.md) |
| **Teach a sign / My signs** | **Parked** (owner's decision): no entry point, code kept. Signs taught earlier can be deleted in Settings |
| **Text → ISL** | **In progress** (parked while Sign → Text is finished). The code is kept in `features/text-to-isl` |
| **Learn** | **In progress** (parked). The alphabet map and tips are kept in `features/learn` |
| **Settings** | Appearance, app and output languages (separate), speech, camera, history (off by default), haptics, demo mode, report a problem, about (limitations) |
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
2. Until a sign pack is installed, the screen says the vocabulary is not installed yet. *Try demo mode* shows how the screen works with simulated, clearly labelled results.
3. To build and install a pack yourself (on a PC with Chrome or Edge): see [`docs/sign-packs.md`](docs/sign-packs.md).

## How recognition works

Hand and pose tracking (MediaPipe) runs on the phone inside the app's camera engine and produces body-centred hand and arm positions, about 15 times a second. Each sign of the vocabulary is a recording of those positions, made from a sign video by the **same** tracking code. Live signing is compared with the recordings by dynamic time warping, which tolerates different speeds, and is also compared mirrored so left-handed signers match. With thousands of signs, a fast first pass picks the 24 closest and only those are compared in full. Hands resting low (on the lap) are ignored. The stabilizer only shows a sign after several agreeing, confident, unambiguous predictions; otherwise it says it is not sure. Details: [`docs/architecture.md`](docs/architecture.md) §6.6–6.8.

Tested with synthetic landmark sequences (speed, position, noise, left-handed signers, mislabeled hands, resting and held hands, 250–2,000 signs), with **real MediaPipe output** from the app's engine on MediaPipe's own hand photos, and end to end in a browser: stand-in videos were turned into a pack by the converter, installed in the web app, and each was recognized live from a fake camera playing the same video. These stand-ins are not ISL; real ISL accuracy is unmeasured.

## Limitations

- Recognizes only the signs in its vocabulary, as its recorded signers sign them; it has **not** been evaluated with real ISL signing across many signers, and "100%" accuracy cannot be promised by any recognizer. Acceptance distances are uncalibrated until testers' recordings exist.
- Signs that differ only in facial expression or mouthing cannot be told apart (face landmarks are not used yet).
- Hands, head and shoulders must be in view (the tracker normalizes by shoulder width). Fast fingerspelling is too quick: spell slowly, about one letter per second.
- Text → ISL (parked) is sign by sign in the order typed, not translation: ISL grammar is not modelled.
- Not yet tested on physical phones in this environment: camera access inside the WebView on specific Android/iOS versions, frame rate on low-end phones, matching speed with a large vocabulary (phones run JavaScript without a JIT), battery, TalkBack/VoiceOver.

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
| [contributing.md](docs/contributing.md) | Conventions, PR and accessibility checklists, adding languages and content |

## Contributing

Read [`docs/contributing.md`](docs/contributing.md). In short: do not invent ISL content, never overclaim accuracy, localize every string, keep data out of git, and treat accessibility as a requirement.

## Decisions waiting for the repository owner

- **License** for code and content (none chosen yet)
- **Sign videos the project may use**: recordings by consenting fluent signers (for example with a Deaf association or ISL teachers), or permission from a dictionary's owners
- **Testers** to sign known words, so recognition of other signers can be measured and calibrated
- **How to ship a large dictionary pack**: inside the app (now) or downloaded on first use, once its size is known
- **App identifier, Expo account and store listing** for production builds

## License

No license has been chosen yet. That is the repository owner's decision.
