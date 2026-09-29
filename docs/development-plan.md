# Development plan

Each phase ends with passing tests, updated documentation and logical commits. Status is kept current as work progresses.

Legend: ✅ done · 🟡 built, but waiting for verified content, a dataset or a decision · ⏳ not started · 🔒 blocked on external input

Sign → Text now recognizes an installed **sign vocabulary**, with a builder that turns sign videos into sign packs using the app's own hand tracking (`docs/sign-packs.md`). A model for all 262 signs of the public INCLUDE dataset (CC BY 4.0) is included. It reads each sign whole once the hands come down. Live on held-out recordings it gets 64% right on the first try, 5% wrong and 31% "not sure"; the right sign is on screen, shown or one tap away in “Did you mean…?”, for 92%. 176 signs are reliable (`docs/include-signs.md`). These are INCLUDE's own signers: on a signer the model never saw (ISL Bible dictionary, CC BY-SA, used for testing only) it gets 15% right on the first try and 15% wrong. More signers per sign are what it needs. Not yet tried by users; more signers per sign are the way to better accuracy. **Text → ISL** shows the same 262 signs: typed English words play as smooth motion traced from one INCLUDE recording per sign, with a still diagram of each; words without a sign are listed, not guessed. Teaching your own signs is back and works with the model: in a same-session test, the person who taught each sign got it right on the first try 78% of the time instead of 65%. Learn is parked.

| # | Phase | Status | Deliverables | Exit criteria |
| --- | --- | --- | --- | --- |
| 1 | Repository audit + architecture | ✅ | Audit, `architecture.md`, `product-spec.md`, this plan, `privacy.md`, `contributing.md`, `.gitignore`, `.env.example` | Docs reviewed in PR |
| 2 | Mobile shell + navigation + design system | ✅ | Expo TS app, bottom tabs + stack, first-launch welcome, Inter, light/dark/system theme, core components, Home | Typecheck + lint + tests green; navigation and welcome tests |
| 3 | Localization | ✅ | i18next, language registry, `en` complete, `hi` draft, others planned; app vs output language; persisted settings | Locale completeness test; language switch test |
| 4 | Camera screen + tracking | ✅ | Permission flow, MediaPipe engine in a WebView/iframe with integrity-checked assets, skeleton overlay, front/back, pause/resume/clear, all error states | Engine protocol/asset tests, camera state tests with a fake engine, browser run with a fake camera |
| 5 | Recognition interface + mock inference | ✅ | `SignRecognizer`, `FrameSource`, `UnavailableRecognizer`, `MockSignRecognizer` (Demo mode), `PredictionStabilizer`, `RecognitionSession` | Stabilizer unit tests (stable, noisy, ambiguous, emergency, cooldown, duplicates) |
| 6 | Real ML pipeline | 🟡 | `signspeak_ml`: feature spec, MediaPipe extractor, dataset loader + signer splits, temporal model, trainer, evaluator, inference engine; `dataset.md`, `model-evaluation.md` | Pytest green on synthetic fixtures. Trained on INCLUDE greetings (`train_from_landmarks.py`); full vocabulary in progress |
| 7 | ISL → Text | 🟡 | Sign-pack vocabulary (builder, installer, loader, first-pass shortlist for thousands of signs), recording-based recognizer (DTW), clean camera + text + speech screen, transcript with fingerspelling, history. Personal signs combined with the model (teach any sign your way) | Pack, loader, shortlist and end-to-end screen tests; builder and live recognition checked in a browser with stand-in videos. **Needs sign videos the project may use, then testers to calibrate** |
| 8 | Text → ISL | 🟡 | Motion pack of the 262 INCLUDE signs (builder: best-tracked, most typical recording per sign, gaps filled along the tracked wrist, smoothed); phrase/word planner with plurals, contractions and suggestions; sentence player joining signs core to core at display frame rate; still diagrams with movement arrows; browse by group | Planner, cleaning, timeline, player and screen tests; every shipped sign checked to decode and show hands; checked in a browser (light, dark, Hindi; ~59 fps drawing). **Needs review by ISL educators; more signs need more sources** |
| 9 | Learn ISL | 🟡 | Alphabet map with guided recording, signing tips | Screen tests. **Needs a fluent signer to record the alphabet; tips need educator review** |
| 10 | Speech | ✅ | `SpeechService` + expo-speech adapter, voice availability, error states | Service tests with mocked engine |
| 11 | Testing | ✅ | Coverage of navigation, localization, camera states, recognition, speech, errors; backend + ML suites; CI | CI green on PR |
| 12 | Performance | 🟡 | Frame-rate throttling, background pause, model size budget, startup profiling | Measured on a low-end Android device 🔒 |
| 13 | Privacy / security review | ✅ | Secrets scan, data-flow review, `privacy.md` update, dependency audit | Checklist complete |
| 14 | Production build | 🔒 | EAS build profiles, app config, store listing drafts | 🔒 needs owner's Expo/Play/App Store accounts |

## Current test inventory

| Suite | Tests | Covers |
| --- | --- | --- |
| Mobile (Jest + RNTL) | 464 | Navigation and welcome over the real route tree, localization, colour contrast, settings, camera engine protocol/assets (incl. portrait/landscape parity), camera states, sign packs (parsing, layouts, loader, vocabulary, provider), first-pass shortlist at 250 signs, resting hands, personal-sign storage/matching/recognition (synthetic and real MediaPipe landmarks), teach flow, My signs, diagrams, Sign → Text end to end, Text → ISL (motion pack builder, cleaning, sign span, words, planner, timeline, player, stills, screen, the shipped pack), Learn, stabilizer, session, speech, history, feedback |
| ML (pytest) | 74 | Feature contract parity, normalization, resampling, augmentation, MediaPipe result conversion, annotation validation, signer-level splits, dataset loading, model, training, calibration, metrics, packs, inference, CLI |
| Backend (pytest) | 35 | Validation, malformed input, model-unavailable, feedback privacy, size limits, CORS, error hygiene, retention |

## Production build (Phase 14): what the owner needs to decide or provide

`mobile/eas.json` has `preview` (internal APK) and `production` profiles. A production build needs:
1. The app identifier (`ios.bundleIdentifier`, `android.package`), which should be based on a domain the project controls
2. An Expo account/project (`eas init`) and signing credentials (managed by EAS or supplied)
3. A store listing, and a public privacy policy URL based on `docs/privacy.md` after legal review
4. The licence decision (D9)

## Critical path items that code cannot solve

These need people and partners. They should start in parallel with engineering:

1. **ISL educators + Deaf community partners:** select and validate the vocabulary, choose regional variants, record or review the alphabet and common signs, and review the tips.
2. **Calibrating the dictionary vocabulary:** testers (ideally fluent Deaf signers) signing known dictionary words, so that acceptance distances can be measured instead of assumed, and recognition of signers other than the dictionary's can be evaluated.
3. **Consented dataset:** many signers, diverse conditions, and signer-level splits (see `docs/dataset.md`).
4. **Translation review:** native speakers review each UI language, with Hindi first.
5. **License decision** for code and content (owner).
6. **Real-device testing:** camera in the WebView on a range of Android/iOS phones, frame rate on low-end devices, TalkBack/VoiceOver.

## Future roadmap (architected, not implemented)

Larger vocabulary → sequential/continuous recognition → ISL linguistic modeling → avatar rendering → speech → ISL → real-time two-way conversation → offline model packs per region → NGO deployment mode (shared-device lockdown, history disabled) → approved-dataset model improvement loop.
