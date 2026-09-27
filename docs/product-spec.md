# Product specification — ISL Connect

Status: **draft v0.1**. It will be refined with NGO partners, Deaf ISL users and qualified ISL educators before any pilot.

## 1. Problem

Many Deaf and hard-of-hearing people in India communicate primarily in Indian Sign Language (ISL). Most hearing people they meet (shopkeepers, clinic receptionists, co-workers, some family members) do not know ISL, and qualified interpreters are scarce. Everyday interactions often fall back to writing, pointing or gesturing, which is slow and sometimes excludes people with limited literacy in written languages.

## 2. What the product is (and is not)

**It is:**
- a communication aid for short, everyday exchanges between ISL users and non-signers
- a way for hearing people and new signers to start learning ISL from verified content

**It is not:**
- a replacement for qualified ISL interpreters, especially in medical, legal, police, educational or emergency settings (the app says this in onboarding and in Settings → About)
- a general ISL translator. At MVP it recognizes a small, curated vocabulary and looks up a curated phrase library

## 3. Users

| User | Needs |
| --- | --- |
| Deaf / HoH ISL user | Be understood quickly by a non-signer, trust that output is not wrong, use their own phone |
| Hearing non-signer (family, shop, clinic front desk) | Understand simple signs, reply in a way the signer can follow |
| Learner (family, teachers, NGO staff) | The fingerspelling alphabet, practical signing tips, and a way to record signs from a fluent signer |
| NGO / pilot coordinator | Deploy on shared devices, collect feedback, trust privacy guarantees |

## 4. Core experiences

### 4.0 First launch
A welcome flow asks for the app language and the appearance (light, dark or follow the phone), then explains in three points how the app works, its privacy model and that it is not an interpreter.

### 4.1 Sign → Text (+ speech)
1. The user opens **Sign → Text**, grants camera permission, and chooses the front or back camera.
2. Live hand and body tracking is drawn over the video as a hand skeleton; a status pill says at once whether a person and hands are in view.
3. Recognized signs appear as text: the dictionary's word, in the dictionary's language (English), with a note when the output language differs; fingerspelled letters are joined into words; **Speak** reads everything recognized so far in the language it is written in. The screen is only camera, text and speech: no teaching or sign management.
4. Controls: pause/resume, clear, switch camera, report a wrong result.
5. When recognition is uncertain it shows *"Not sure what was signed. Please try again."* It never shows a guess.
6. Emergency-category signs need stricter confidence and agreement before they are shown.
7. Recognition covers the installed **sign vocabulary**: sign packs made from the videos of the ISL dictionary at indiansignlanguage.org, used with permission (`docs/sign-packs.md`). The screen says how many signs it knows and credits the source. With no pack installed it says "Sign vocabulary not installed yet"; Demo mode remains available, clearly labelled.

### 4.2 Text → ISL
1. The user types (or pastes) words in their language.
2. **Show signs** splits the text into known phrases and words (longest first) and plays each recorded sign as an animated hand diagram with its caption; words without a sign are fingerspelled letter by letter.
3. Anything not recorded yet is shown as "not recorded yet" with a button to record it. Nothing is guessed or invented.
4. The UI states that this is sign by sign in the order typed, not ISL translation (ISL has its own grammar).

### 4.3 Learn ISL
- **Alphabet map:** all 26 letters as hand diagrams from recordings made on the phone, with a guided flow to record the alphabet. Letters not yet recorded are shown as empty tiles. The screen asks for a fluent signer or ISL teacher to record or check the letters, because no verified alphabet is bundled.
- **Tips** for communicating in sign language (attention, eye contact, light, facial expression, fingerspelling, ISL as its own language, regional variation, checking understanding, signing space, interpreters, learning from Deaf people), labelled as pending review by ISL educators.

### 4.4 History
- On-device list of recent recognized text and phrase lookups.
- **Off by default.** The user enables it in Settings and can clear it at any time.

### 4.5 Settings
- Appearance: system, light or dark
- App language (UI) and output language (text/speech), set separately
- Speech on/off and rate
- Camera default (front/back)
- History on/off and clear history
- Demo mode (simulated recognition, clearly labelled)
- Report a problem / feedback
- About: limitations, privacy summary, "not a replacement for interpreters"

### 4.6 Teach a sign / My signs (paused)
Parked by the owner's decision while Sign → Text uses the dictionary vocabulary: there is no entry point in the app, but the code, routes and tests are kept, and signs taught earlier can still be deleted in Settings. When testers are available, recordings of their signing will be used to calibrate the dictionary vocabulary.
- Teach a common word from the library, any typed word or phrase, a single letter, or the whole alphabet.
- Each take: countdown, a few seconds of recording (landmarks only), animated replay, and checks (no one in view, no hands, too short, unlike earlier takes). Words need three takes, letters two.
- My signs lists every sign with its takes and readiness; takes, signs, or everything can be deleted.

## 5. Languages

App UI: English first. Hindi is included as a draft pending native-speaker review. Bengali, Tamil, Telugu, Marathi, Gujarati, Kannada, Malayalam and Punjabi are registered as planned and are added as translations get reviewed.

Output/speech language is independent of UI language, and availability depends on on-device TTS voices.

## 6. MVP vocabulary

A small set of high-value concepts, to be **selected and validated with ISL educators**. Candidate concepts (English meanings, not sign descriptions): hello, thank you, sorry, please, yes, no, help, water, food, toilet, doctor, pain, emergency, stop, wait, name, what, where, when, family, mother, father, numbers 0–10.

Regional variation in ISL is real. Each entry records its variant in `verification.region`, and the chosen variant must be documented with its source.

## 7. Responsible-AI rules (product requirements)

1. Never show a recognized sign below the configured confidence/stability thresholds.
2. Never show confidence numbers unless the model is calibrated. Show bands ("High confidence"), not raw scores.
3. Simulated/demo output always carries a persistent, screen-reader-announced banner.
4. Emergency signs use stricter thresholds.
5. No marketing or UI copy claims "accurate translation" or "understands ISL".
6. Model limitations and evaluation results (signer-independent) are published in-app (About) and in `docs/model-evaluation.md`.

## 8. Accessibility requirements

- Touch targets ≥ 48×48 dp. Text scales with system font size, and layouts do not clip at 200%.
- Contrast ≥ 4.5:1 for body text and ≥ 3:1 for large text and icons (WCAG 2.2 AA).
- All controls have screen-reader labels and roles, and status changes are announced.
- Information is never conveyed by colour alone (icons + text) or by sound alone (speech is always also shown as text).
- No autoplaying or decorative animation, and the system's reduced-motion setting is respected.
- Plain language and short sentences. One primary action per screen.
- Haptic confirmation when a sign is recognized (optional, can be disabled).

## 9. States each feature must handle

Loading · Success · Empty · Unknown · Low confidence · No camera · No permission · No network · Model error · Speech error · Unsupported language · Content unavailable.

## 10. Non-functional requirements

| Area | Target (to be validated on low/mid-range Android) |
| --- | --- |
| Cold start | < 3 s to interactive home |
| Recognition latency | < 300 ms window-to-result on device (once a real model exists) |
| Model size | < 15 MB per pack |
| Battery / thermal | Recognition pauses when the app is backgrounded and throttles when the device is hot |
| Offline | UI, learning, settings, speech (if a voice is installed) and on-device recognition |
| Privacy | No raw video leaves the device. No analytics SDKs. No accounts |

## 11. Pilot success signals (to be defined with partners)

- Task completion for scripted everyday exchanges
- Rate of *wrong* outputs shown (target: very low; uncertain is preferable to wrong)
- Alphabet recorded and signs taught per device (counted on the device only, never collected)
- Accessibility feedback from Deaf users
- Qualitative trust ratings

## 12. Out of scope for MVP

Continuous sentence recognition, avatar animation, speech → ISL, real-time two-way conversation mode, accounts, cloud sync, personalized learning. The architecture reserves extension points for these (see `docs/architecture.md`).
