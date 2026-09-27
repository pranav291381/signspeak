# Architecture — ISL Connect (repository: `signspeak`)

Status: **living document**. Update it whenever a component, interface, or decision changes.

---

## 1. Repository audit (Phase 1, 2026-09-26)

| Item | Finding |
| --- | --- |
| Commits | One commit (`Initial commit`) |
| Files | `README.md` containing only `# signspeak` |
| Framework | None |
| Source code | None. No earlier camera prototype exists in this repository |
| Dependencies / build scripts / config | None |
| Tests / CI | None |
| Secrets | None found (manual grep of tracked files and history) |
| License | **None.** Licensing is an owner decision (see §14) and has not been chosen here |

Conclusion: nothing needs preserving or refactoring. The project starts from the stack recommended in the build brief:

- **Mobile:** React Native + Expo + TypeScript
- **Backend:** Python + FastAPI (optional services only, no raw video)
- **ML:** Python + PyTorch + MediaPipe landmarks
- **Tests:** Jest + React Native Testing Library, Pytest
- **CI:** GitHub Actions

Environment note: `download.pytorch.org` is blocked by this development environment's network policy. CPU PyTorch has to come from PyPI, and CI installs it the same way (see `ml/README.md`).

---

## 2. Principles that shape the architecture

1. **Honesty over fluency.** When recognition is uncertain the output is an explicit *uncertain* state, never a guess. Mock components always identify themselves as simulated.
2. **On-device first.** Camera frames never leave the phone by default. Server components receive landmarks or text, never raw video, and only with consent.
3. **Replaceable intelligence.** The UI depends on interfaces (`SignRecognizer`, `FrameSource`, `SpeechEngine`/`SpeechService`, `KeyValueStore`) and on the content library functions, not on specific models or platform modules.
4. **Verified content only.** ISL demonstrations, glosses and meanings come from reviewed content. Unverified entries are data placeholders with an explicit `verification.status`.
5. **Localization from day one.** No user-facing string is written inline. The app language and the speech/output language are separate settings.
6. **Every state is designed.** Loading, empty, unknown, low confidence, no camera, no permission, no network, model error, speech error, unsupported language, content unavailable.

---

## 3. System overview

```
                    ┌──────────────────────── Mobile app (Expo, on-device) ────────────────────────┐
                    │                                                                                │
 PHONE CAMERA ──▶ FrameSource ──▶ FeatureExtractor ──▶ WindowBuffer ──▶ SignRecognizer ──▶ Stabilizer │
                    │   (frames)     (landmarks v1)     (sliding T)     (class probs)    (stable /   │
                    │                                                                  uncertain)  │
                    │                                                        │                     │
                    │                                                        ▼                     │
                    │                                    Gloss ─▶ Output text (output language)   │
                    │                                                        │                     │
                    │                                                        ▼                     │
                    │                                               SpeechService (optional)       │
                    │                                                                                │
 TEXT INPUT ─────▶ Normalizer ──▶ PhraseMatcher ──▶ Verified sign library ──▶ Demonstration view    │
                    │            (future: ISL linguistic transformation → sign sequence → avatar)   │
                    │                                                                                │
 LEARN ISL ─────▶ Lessons ──▶ Demonstration ──▶ Practice ──▶ Quiz ──▶ Progress (local storage)       │
                    └────────────────────────────────────────────────────────────────────────────────┘
                                   │ optional, consented, text/landmarks only
                                   ▼
                    ┌──────────── Backend (FastAPI) ─────────────┐
                    │ /health  /v1/model  /v1/recognize          │
                    │ /v1/feedback  (content/model-pack delivery │
                    │  planned)                                  │
                    └────────────────────────────────────────────┘

                    ┌──────────── ML (offline, Python) ──────────┐
                    │ dataset → features → temporal model →      │
                    │ evaluation (signer-independent) → export   │
                    │ → versioned model pack for mobile          │
                    └────────────────────────────────────────────┘
```

---

## 4. Repository layout

```
/
├── README.md
├── .env.example            # variable names only, never values
├── .github/workflows/      # CI
├── docs/                   # product, architecture, privacy, dataset, evaluation, pilot
├── mobile/                 # Expo React Native app (TypeScript, Expo SDK 57)
│   └── src/
│       ├── app/            # expo-router routes (thin files that render feature screens)
│       ├── components/     # design system: Screen, AppText, Button, Card, Notice, StateView…
│       ├── theme/          # tokens: color (light/dark), spacing, typography, radii
│       ├── accessibility/  # reduce-motion and other a11y hooks
│       ├── storage/        # KeyValueStore interface (AsyncStorage / in-memory for tests)
│       ├── i18n/           # i18next setup, language registry
│       ├── locales/        # <lang>/common.json
│       ├── settings/       # settings model, persistence, provider
│       ├── recognition/    # interfaces, mock recognizer, stabilizer, session
│       ├── camera/         # camera state handling
│       ├── speech/         # SpeechService abstraction
│       ├── content/        # sign library (candidate concepts), phrase normalization
│       ├── engine/         # camera engine host: WebView/iframe, protocol, asset sources
│       ├── personal/       # taught signs: storage, recording clean-up, DTW matcher, recognizer
│       ├── diagram/        # hand-skeleton diagrams (SVG) and the sequence player
│       ├── history/        # local history store
│       ├── feedback/       # feedback schema + report composer
│       └── features/       # screens: welcome, home, sign-to-text, text-to-isl, learn, teach, signs, history, settings
│   └── engine/             # camera engine page (MediaPipe), bundled into one HTML string
├── backend/                # FastAPI service (optional; no raw video)
├── ml/                     # Python package `signspeak_ml` + dataset layout (data is gitignored)
└── shared/                 # cross-component contracts (feature spec, schemas)
```

---

## 5. Mobile app

### 5.1 Layers

| Layer | Responsibility | Depends on |
| --- | --- | --- |
| `src/app/` routes | Navigation only | `features/` |
| `features/*` | Screens: compose components, call services via hooks | components, services |
| `components/` + `theme/` | Design system, accessibility defaults (48dp targets, roles, labels) | nothing app-specific |
| Services (`recognition`, `speech`, `content`, `history`, `settings`) | Business logic as plain TypeScript, unit-tested without React | platform adapters |
| Platform adapters | `expo-camera`, `expo-speech`, AsyncStorage, `expo-localization` | Expo SDK |

Plain-TypeScript services keep the logic testable and let a platform library be swapped without touching screens.

### 5.2 Navigation

Bottom tabs for the five main places, with a root stack for everything opened from them:

```
Welcome (first launch only: language → appearance → how it works)

Tabs: Home │ Sign → Text │ Text → ISL │ Learn │ Settings
Stack on top: My signs ── Sign detail
              Teach a sign (chooser → recorder; also ?kind=library|custom|letter|alphabet)
              History, Report a problem
```

`(tabs)/_layout.tsx` redirects to `/welcome` until `settings.onboardingComplete` is true.

### 5.3 Feature state model

Every feature screen renders from a discriminated union rather than ad-hoc booleans, so there is no silent failure path. For example, `SignToTextState`:

```
idle | loading | no_permission | permission_denied_permanently | no_camera
| model_unavailable | model_error | listening | uncertain | recognized | paused
```

`StateView` (design system) renders the icon + title + message + recovery action for each non-happy state.

---

## 6. Recognition pipeline

### 6.1 Interfaces (TypeScript, `mobile/src/recognition/`)

```ts
interface LandmarkFrame {        // one camera frame, feature contract v1 (shared/feature_spec_v1.json)
  timestampMs: number;
  values: Float32Array | null;   // flattened, normalized; null when nobody was detected
}

interface FrameSource {          // camera → landmark frames
  start(onFrame: (f: LandmarkFrame) => void): void;
  stop(): void;
}

interface SignRecognizer {       // window of frames → class probabilities
  readonly info: RecognizerInfo; // id, kind ('simulated' | 'on_device' | 'remote'), labels, calibrated
  load(): Promise<void>;         // throws RecognizerUnavailableError when no model is installed
  predict(window: LandmarkFrame[]): Promise<RawPrediction>;
  dispose(): void;
}

interface RawPrediction { scores: { label: string; score: number }[]; latencyMs: number }
```

`RecognitionSession` wires `FrameSource → WindowBuffer → SignRecognizer → PredictionStabilizer` and emits a `RecognitionUpdate` (`listening | uncertain | recognized`) to the UI hook. The UI never calls a model directly.

### 6.2 Implementations

| Implementation | Status | Notes |
| --- | --- | --- |
| `EngineFrameSource` | Implemented | Live landmark frames from the camera engine (§6.7) |
| `ReferenceSignRecognizer` (id `sign-pack-dtw`) | Implemented | Recognizes the signs of the installed sign packs, e.g. the ISL dictionary (§6.8). What Sign → Text uses |
| `PersonalSignRecognizer` | Implemented, parked | The same matching over signs taught on this phone (§6.6). Teaching is paused while the dictionary vocabulary is built; the code and routes are kept |
| `UnavailableRecognizer` + `NoFrameSource` | Implemented | With no vocabulary: `model_unavailable`; the screen says the vocabulary is not installed yet |
| `MockSignRecognizer` + `SimulatedFrameSource` | Implemented | Scripted outputs, including uncertain and noisy sequences. Only reachable by switching on **Demo mode**, and the UI shows a persistent "Simulated — not real recognition" banner |
| `ModelSignRecognizer` (`mobile/src/model/`) | Implemented; no model shipped yet | Runs a trained model pack (§6.5) in plain TypeScript on the last 32 frames (depth dropped, as in training); idle while no hand is raised. Chosen over sign packs when a model is installed |

`createRecognitionSession()` (`recognition/engine.ts`) picks one of these: demo mode, else the sign-pack vocabulary, else personal signs, else unavailable. Both recording-based recognizers use a time-based window (`RecognizerInfo.windowMs`, last 3 s, first prediction after 8 frames), `requireHands` (status `no_hands` when a person is visible without hands) and `idle` predictions (resting hands never lead to "not sure").

### 6.3 Feature contract (train/serve parity)

Training (Python MediaPipe) and inference (mobile) have to produce identical feature vectors. The contract lives in `shared/feature_spec_v1.json` and is generated from and tested against `ml/signspeak_ml/features/spec.py`:

- Landmarks: 21 left-hand + 21 right-hand + a subset of upper-body pose (nose, shoulders, elbows, wrists, hips). Face landmarks are reserved for v2, because non-manual markers matter in ISL.
- Coordinates: x, y, z normalized by shoulder midpoint (origin) and shoulder width (scale). This makes the vector robust to distance and framing. MediaPipe divides x by the image width and y by its height, so before normalization y is rescaled by height / width (both axes in image-width units). Without this, the same person would give vertical distances about 3× apart in a portrait phone camera and a landscape dictionary video (`isotropic` in `engine/core.ts`, `frame_from_mediapipe` in the Python extractor).
- Presence flags for each hand. A missing hand is encoded as zeros + flag 0 rather than dropped.
- Fixed frame rate (resampled to 15 fps) and window length (default 32 frames ≈ 2.1 s).

Any change to the contract bumps its version. Model packs declare the version they need, and the app refuses a mismatched pack.

### 6.4 Stabilization layer (`PredictionStabilizer`)

Frame-level outputs are noisy. The stabilizer (`mobile/src/recognition/stabilizer.ts`, config in `config.ts`) turns them into a result a person can trust. All values are configurable and validated:

| Parameter | Default | Purpose |
| --- | --- | --- |
| `smoothingWindow` | 5 | Mean of the class scores over the last N predictions |
| `minConfidence` | 0.70 | Smoothed top score must reach this |
| `minMargin` | 0.15 | Gap between the top-1 and top-2 smoothed scores (guards against ties) |
| `minStablePredictions` | 4 | "Minimum stable frames": consecutive predictions whose raw top label agrees with the smoothed candidate |
| `emergencyMinConfidence` | 0.85 | Stricter confidence threshold for signs flagged `emergency` in the library |
| `emergencyMinStablePredictions` | 6 | Stricter agreement for emergency signs |
| `cooldownMs` | 1200 | After a result, wait before showing a *different* sign |
| `duplicateSuppressionMs` | 2500 | The same sign is shown again only after it was released (hands dropped or a different sign) **and** this much time passed |
| `uncertainAfterPredictions` | 8 | Predictions of activity without a result before telling the user "not sure" |
| `highConfidenceThreshold` | 0.90 | Calibrated recognizers only: boundary between "high" and "medium" bands |

The unknown class (`__unknown__`) is never shown as text. Non-finite scores count as zero, so a malfunctioning model produces "not sure" rather than a sign.

Each prediction produces a `StabilizerStep`:
- `no_signer`: nobody in view. Evidence is reset
- `analyzing`: watching, not enough evidence yet (or a held sign that was already shown)
- `uncertain` + reason (`low_confidence | ambiguous | unknown_sign | unstable`): shown as "Not sure what was signed. Please try again." with a hint
- `recognized` + `Recognition { label, band, timestampMs }`

A confidence **band** is reported only when the recognizer declares `calibrated: true`. Uncalibrated and simulated recognizers show no numbers and no bands.

`RecognitionSession` adds backpressure: while a prediction is running, new windows are skipped rather than queued. It also skips the model entirely when fewer than half the frames in a window contain a person, and reports `model_error` after three consecutive inference failures.

### 6.5 Model packs

A trained `TemporalSignClassifier` (per-frame LayerNorm, two 1D convolutions, bidirectional GRU, attention pooling; about 0.5 M parameters) is exported by `ml/signspeak_ml/inference/app_export.py` as one JSON file, `islconnect-model-pack` v1: configuration, labels with their text, language, softmax temperature, whether calibration was verified, source and licence, headline evaluation, and the weights (float32, base64; batch norm folded into the convolutions). It is installed like a sign pack (`npm run install:signpack`) and loaded by the same provider. The app runs it without any native runtime (`mobile/src/model/temporalModel.ts`); a parity fixture (`shared/fixtures/model_parity_v1.json`) pins the TypeScript forward pass to PyTorch (logits equal to 4 decimals), and a NumPy reference (`app_forward`) checks the folding.

**Training from landmarks** (`ml/scripts/train_from_landmarks.py`): recordings exported with the app's own tracking (`npm run export:landmarks`, one JSON line per video with a group: signer or session) are cut into the windows the app sees live: 32 frames, with the person in view before and after (first and last frame held). A window holding most of a sign is that sign; a window where a sign has only begun, or with only rest, is "none of these" (`__unknown__`), so the model does not guess from a sign's first movements. Augmentation mirrors hands, scales, rotates, shifts and time-warps. For each sign whole groups are held out (validation, test); temperature is fitted on validation.

Early evidence (INCLUDE Greetings, 9 signs, about 20 videos each, held-out recording sessions, played through the app's live session by `npm run eval:signpack`): 90% correct, 0% wrong, 10% "not sure", against 28% correct for sign-pack matching on the same videos. Sessions may share signers, so this overstates accuracy for new signers.

### 6.6 Personal signs (`mobile/src/personal/`)

Recognition that works without a trained model: the user (ideally a fluent signer) teaches each sign by recording it 2–3 times, and live signing is matched against those recordings.

- **Recording** (`sample.ts`): frames are resampled to 15 fps by timestamp, trimmed to the part with hands visible (≥ 6 frames, ≤ 4 s), and stored as Int16 × 1000, base64 (`codec.ts`), one AsyncStorage key per sign (`store.ts`). Problems are explained: no signer, no hands, too short.
- **Features for matching** (`compact.ts`): per hand, presence, wrist position (body-centred) and ten finger points relative to the wrist divided by hand size (handshape independent of distance); plus elbows. x/y only (MediaPipe depth is too noisy). The frame distance takes the better of "hands as labelled" and "hand slots exchanged", because MediaPipe's left/right labels can flip between frames.
- **Matching** (`dtw.ts`, `matcher.ts`): subsequence DTW (symmetric steps, normalized by path weight) finds the best stretch of the live window for each take's core (the middle of the take). Queries are also compared mirrored, so a left-handed signer matches right-handed takes.
- **Acceptance** per sign from its own takes: leave-one-out distance between takes, `θ = clamp(1.8 × median, 0.5, 1.2)`. Scores are a softmax over `−6 × distance / θ` with "unknown" at 1, fed to the existing `PredictionStabilizer`, so ambiguity and unknown movement still produce "not sure", never a guess.
- **Evidence** (`personal/__tests__`): synthetic landmark sequences (speed, position, noise, left-handed, label flips) and real MediaPipe landmarks captured from the app's engine on MediaPipe's hand test photos (`fixtures/mediapipe_hands.json`): repeats of a handshape score 0.15–0.29 of θ, different handshapes ≥ 1.6, and an untaught handshape is rejected.
- **Resting hands**: a hand whose wrist is lower than 1.2 shoulder widths below the shoulders (on the lap, arms hanging) is not signing. It counts as absent in the compact features, and recordings and live windows are trimmed to the frames with a hand raised (`handsRaised`, `REST_WRIST_Y` in `recognition/features.ts`). So a hand resting in view never spoils a match, and a resting pose is not a sign.
- **Limits**: it recognizes only what was taught, as the teacher signed it; it has not been evaluated with real ISL signing across signers; see README.

### 6.7 Camera engine (`mobile/engine/`, `mobile/src/engine/`)

MediaPipe Tasks Vision (hand + pose landmarkers, VIDEO mode, GPU with CPU fallback) runs in a page that is bundled into one HTML string (`scripts/build-engine.mjs`, checked by `npm run check:engine`) and loaded in a WebView on phones (origin `https://localhost`, a secure context) or an iframe on the web. Only landmark numbers are posted to the app. Model and WASM files are fetched once from the configured sources, verified against pinned SHA-256 hashes (by role, so a swapped file is rejected), and cached. Speed: at start the page checks the WebGL renderer and skips MediaPipe's GPU path on software renderers (SwiftShader, llvmpipe, Microsoft Basic Render), where it is many times slower than the WASM CPU path; otherwise it measures the GPU and switches to the CPU if that is faster (`DelegateTuner`). Hand tracking runs every detection (up to 30/s), pose (only needed for shoulder normalization) every third, and frames are posted to the app at 15/s. The skeleton of both hands (blue bones, teal joints) is redrawn on every display frame, easing toward the latest detection, so it moves smoothly even when detection is slower; it flashes on recognition. Webcams that do not report their facing mode are mirrored on the web. A stats message (rate, time per detection, GPU/CPU) is shown as a small label.

### 6.8 Sign packs (`mobile/src/signpack/`, `mobile/scripts/build-sign-pack.mjs`)

The vocabulary of Sign → Text comes from **sign packs**: reference recordings made from sign videos the project has the right to use (public licences, recordings by consenting signers, or videos whose owners give permission), or a trained model pack (§6.5). One is included: `include-greet`, a model for 9 greetings from INCLUDE (CC BY 4.0). Details and the how-to: [`sign-packs.md`](sign-packs.md).

- **Builder** (`scripts/build-sign-pack.mjs`, Node): reads a manifest (word, video, source page), downloads each video once to a local cache, and serves the extraction page `engine/extract.ts` with the MediaPipe files to Chrome/Edge/Chromium through `playwright-core` (a dev dependency; no browser download). The page seeks through each video at 15 fps and runs **the same** hand and pose landmarkers, `frameValues` and `prepareSample` as the app, so dictionary recordings and live signing produce the same kind of numbers. Videos the browser cannot decode are converted with ffmpeg if available. Results are cached per video and keyed by a hash of the extractor and models, so re-runs resume. It writes the pack and a report (per-video counts and problems, and the three closest other signs for each sign by the app's own matching).
- **Pack**: JSON, `islconnect-sign-pack` v1, samples without depth (105 values per frame, Int16 × 1000, base64). `scripts/install-sign-pack.mjs` copies packs to `assets/signpacks/` (a Metro asset type, `metro.config.js`) and regenerates `src/signpack/bundled.ts`.
- **App**: `SignVocabularyProvider` reads the bundled packs the first time Sign → Text opens (`expo-asset` + `fetch` on the web, `expo-file-system` on phones), validates them (`parse.ts`: wrong format, feature version or frame rate is rejected; single broken signs are dropped and counted) and builds the `Vocabulary` (labels → word, language, source).
- **Matching at dictionary scale** (`personal/prefilter.ts`): full DTW against thousands of signs is too slow at 5 predictions a second. A first pass compares each sign's core, reduced to 5 frames, with the live window at a third of its frame rate by the same subsequence DTW (so any timing, pause or speed still lines up), abandoning a sign as soon as it cannot beat the current 24th best. Only those 24 get the full comparison. Used from 48 signs. Synthetic benchmark (random one- and two-handed movements, other "signers" at 0.75–1.35× speed, noise, offsets, 20% left-handed): with 2,000 signs, the signed sign was among the 24 candidates in 100% of queries, including with hands resting low or held still after the sign; 12–22 ms per prediction in Node/V8 (1 s to build the index).
- **Accuracy test** (`scripts/eval-sign-pack.mjs`): test videos are analysed like pack videos, then played frame by frame into `referenceSession` (the exact session, window, stride and stabilizer of Sign → Text) inside the extraction page; it reports correct / wrong / "not sure", false alarms on signs outside the pack, and distance statistics for calibration. The builder and the test share `scripts/lib/signpack-runner.mjs`.
- **Thresholds**: one recording per sign cannot give a leave-one-out spread, so each sign uses `threshold` or the pack's `defaultThreshold` (0.9, uncalibrated). An explicit threshold always wins over leave-one-out, because a dictionary's variants of a word are not repeats.

---

## 7. Text → ISL

```
text ─▶ normalize (Unicode NFC, case, punctuation, whitespace)
     ─▶ planSigns(): longest phrases first (≤ 5 words), matched against
          signs the user taught (custom words) and the library concepts' phrases (all languages)
     ─▶ unmatched Latin word → fingerspelled letter by letter (A–Z)
        unmatched number     → digit by digit (library number concepts)
        anything else        → shown as "not recorded" (never guessed)
     ─▶ SignSequencePlayer: each item's first recorded take as an animated hand diagram
```

Implemented in `mobile/src/features/text-to-isl/plan.ts` and `mobile/src/diagram/`. Diagrams come only from recordings made on the phone; an item without a recording is shown as such, with a button to record it.

**Limit (stated in the UI):** this is sign by sign in the order typed, not translation. ISL has its own grammar (word order, spatial reference, non-manual markers). A future `TextToIslPipeline` could add an ISL grammar stage designed and reviewed by ISL linguists; the player does not need to change for that.

## 8. Learn ISL

- **Alphabet map** (`features/learn/LearnScreen.tsx`): A–Z tiles showing each recorded letter as a hand diagram, a progress count, and a guided "record the alphabet" flow (letter by letter, two takes each, skippable). The app ships no alphabet images: the notice asks for a fluent ISL signer or teacher to record or check them.
- **Tips** (`features/learn/tips.ts`, text in the locale files): general guidance for communicating in sign language (getting attention, eye contact, lighting, facial expression, fingerspelling, ISL as its own language, regional variation, checking understanding, signing space, interpreters, learning from Deaf people). Labelled as pending review by ISL educators.
- The earlier lessons, quizzes and progress were removed at the owner's request.

The sign library (`content/data/signs.json`) remains the list of candidate concepts (IDs, meanings and phrases in English and Hindi) used by the teach chooser and Text → ISL. None has verified content.

## 9. Localization

- `i18next` + `react-i18next`. Resources are imported statically from `mobile/src/locales/<lang>/common.json` so they work offline.
- A language registry lists `code`, native name, script, text direction and translation `status` (`complete | draft | planned`). Only `complete` and `draft` languages are selectable. `draft` translations are labelled as awaiting native-speaker review.
- Settings keep **`appLanguage`** (UI) and **`outputLanguage`** (recognized-text rendering and speech) separate. Example: Hindi UI with English speech.
- Missing keys fall back to English and are caught by a completeness test.

## 10. Speech

`SpeechService.speak(text, language, rate)` returns a result union: `ok | stopped | empty_text | unsupported_language | engine_unavailable | error`. The `expo-speech` adapter uses the platform's on-device TTS. It checks the installed voices for the requested language and reports `unsupported_language` rather than silently speaking with the wrong voice. Spoken output is always also shown as text, because sound alone never carries critical information.

## 11. Offline strategy

| Capability | Offline? |
| --- | --- |
| UI, settings, localization | Yes (bundled) |
| Tips, sign library, taught signs, diagrams | Yes (bundled + local storage) |
| Hand tracking | Yes, after its files were downloaded once (cached, hash-checked); the web build serves them itself |
| Recognition of taught signs | Yes (on device) |
| Speech | Yes, if the device has an on-device voice for the language |
| Feedback submission | Queued/exported locally, sent when online (planned) |

## 11a. Performance and battery (Phase 12)

Implemented:
- Camera and tracking **pause** (the camera is released) when the screen loses focus, the app is backgrounded, or the user taps Pause
- The engine processes at most 15 frames per second and never queues frames (a busy flag drops frames while one is processed)
- **Backpressure:** windows are skipped, never queued, while a prediction runs, so latency cannot build up on slow phones
- The model is **not run** when fewer than half the frames in a window contain a person
- Inference cadence is set by `stride` (default every 4 frames at 15 fps ≈ 3.75 predictions/s)
- Model size budget is enforced by a test (< 1 M parameters, well under the 15 MB pack budget)
- The evaluator reports per-window latency (median/p95)

Not done yet, because it needs a real model and devices: on-device latency, thermal and battery measurements (`docs/model-evaluation.md` §5), adaptive stride when the device is hot, and startup profiling on a low-end Android phone.

## 12. Backend (`backend/`)

The backend is optional, and the app works fully without it.

- `GET /health`
- `GET /v1/model`: info about the server-side model, or "none installed"
- `POST /v1/recognize`: accepts a **landmark sequence** (feature contract v1), never images or video. Returns ranked labels or `503 model_unavailable`. Intended for research/evaluation and opt-in use only
- `POST /v1/feedback`: structured, minimal feedback (see `docs/pilot.md`). No IP address, account or device ID is stored; retention is enforced by a purge job
- Strict validation, a 1 MB body limit, CORS allow-list, and errors that never echo input (`docs/security-review.md`)

Persistence: SQLAlchemy, with SQLite for local development/tests and PostgreSQL in deployment (`DATABASE_URL`). No accounts exist.

## 13. ML (`ml/`)

Package `signspeak_ml` with small, replaceable interfaces:

| Interface | Responsibility |
| --- | --- |
| `FeatureExtractor` | video → landmark sequence (MediaPipe implementation; optional dependency) |
| `DatasetLoader` | annotations (JSONL) + processed features → samples; enforces signer-level splits |
| `SignRecognizer` / `InferenceEngine` | model + labels → ranked predictions for a window |
| `ModelTrainer` | training loop, checkpoints, reproducible seeds |
| `Evaluator` | accuracy, macro P/R/F1, confusion matrix, per-sign, per-signer, latency |

The first model is a small temporal classifier (1D temporal convolutions + GRU, with attention pooling) over landmark sequences. It is deliberately modest, and transformers or continuous recognition come later (see `docs/development-plan.md`). Details are in `docs/dataset.md` and `docs/model-evaluation.md`.

---

## 14. Decision log

| # | Decision | Rationale | Status |
| --- | --- | --- | --- |
| D1 | Expo + TypeScript for mobile | Brief's preferred stack. Managed builds, first-party camera/speech/localization modules | Accepted |
| D2 | `expo-router` for navigation | Expo default. Typed routes and deep links (e.g. open a taught sign or the recorder for a letter) | Accepted |
| D3 | `expo-camera` only for the camera **permission** flow | First-party, works in Expo Go | Accepted |
| D4 | Real-time landmark extraction on device: MediaPipe Tasks Vision in an in-app web engine (WebView on phones, iframe on the web) | Chosen by the owner ("in-app web engine") over a native frame-processor plugin: works in Expo Go and on the web with one code path, no native build needed. Cost: WebView overhead, one-time model download | Accepted (owner) |
| D5 | `i18next` + `react-i18next` + `expo-localization` | Mature, supports plurals/interpolation, and resources are statically bundled for offline use | Accepted |
| D6 | No raw video leaves the device by default. The server accepts landmarks only | Privacy (see `docs/privacy.md`) | Accepted |
| D7 | Recognition defaults to `UnavailableRecognizer`. The mock is opt-in "Demo mode" with a persistent banner | Never present simulated output as real | Accepted |
| D8 | History is stored on device only and is **off by default** | Shared phones at NGO sites, and conversation text is sensitive | Accepted, revisit with pilot partners |
| D9 | No license file added | Licensing is the owner's decision | **Open, needs owner decision** |
| D10 | Content lives in the app bundle as typed JSON with verification metadata | Works offline. Can later be delivered by the backend as versioned packs | Accepted |
| D11 | Recognition of **personal signs** (taught on the phone) until a trained model exists | Chosen by the owner ("personal signs mode"). Works today, honestly scoped to what was taught | Accepted (owner) |
| D12 | Diagrams (Text → ISL, alphabet) are drawn from recordings made on the phone, never from invented handshapes | The project must not invent ISL content; no verified references were available | Accepted |
| D13 | Bottom tabs + first-launch welcome (language, appearance), Inter font, light/dark/system theme | Owner request for a modern, low-clutter UI with a first-run menu | Accepted (owner) |
| D14 | `react-native-svg` for diagrams, `@expo-google-fonts/inter` for type | Standard, in Expo Go; no native build needed | Accepted |
| D15 | Sign → Text vocabulary as sign packs built offline from sign videos with the app's own tracking | One pipeline for any source the project may use. The ISL dictionary at indiansignlanguage.org (YouTube channel "Indian Sign Language RKMVU-CBE") was the first candidate, but **its owners have not given permission**, and YouTube's terms do not allow downloading, so it is not used | Accepted. First source: INCLUDE (CC BY 4.0), see D20 |
| D16 | Teaching your own signs is paused; Sign → Text is camera, text and speech only | Owner request ("isl-text should be clean camera and text and speech"). Code, routes and tests of personal signs are kept; earlier taught signs can still be deleted in Settings | Accepted (owner) |
| D17 | `playwright-core` (dev dependency) drives the user's installed Chrome/Edge for the pack builder | Runs the exact browser code of the app on dictionary videos; no browser download, nothing added to the app | Accepted |
| D18 | `expo-file-system` to read bundled packs on phones | Part of Expo (in Expo Go); `fetch` of `file://` is not reliable on Android | Accepted |
| D19 | Packs bundled as app assets for now | Works offline, no hosting. Revisit when the real pack's size is known: a large pack may need to be downloaded on first use | **Open, owner decision when the pack exists** (the greetings model is 1.7 MB) |
| D20 | Train the first model on INCLUDE (Zenodo 4010759, CC BY 4.0), starting with its 9 greetings | A public ISL dataset recorded by Deaf signers, with a licence that allows reuse with attribution. Videos are processed only on the machine that trains; only model weights are committed. Credit (authors, licence, changes) is in the pack, shown in the app (Sign → Text, Settings → About) and in the README | Accepted (owner chose INCLUDE); full 262-word model in progress |
