# Model evaluation

Status: one trained model ships, for the 262 signs of the INCLUDE dataset (results in §8). It was tested on held-out recording sessions of INCLUDE's signers, not yet on new signers or with users, so it does **not** meet the proposed release criteria in §4. This document defines how every model must be evaluated before it can ship, and what must be published with it.

## 1. What we evaluate on

- **Test signers the model has never seen** (signer-level split, `docs/dataset.md` §8). Results on signers who were in training are not reported as model performance.
- The test split is used **once per release**. All tuning happens on the validation signers: early stopping, thresholds, temperature.
- The same windowing the app uses: 32 frames at 15 fps, centred on the annotated segment.

## 2. Metrics

`signspeak-ml train` evaluates on test signers automatically. `signspeak-ml evaluate` re-runs an existing pack. The implementation is in `ml/signspeak_ml/evaluation/`.

| Metric | Why |
| --- | --- |
| Accuracy | Headline number, never reported alone |
| Macro precision / recall / F1 | Treats every sign equally, so frequent signs cannot hide rare ones |
| Per-sign precision / recall / F1 | Finds signs that are unreliable and must be removed or improved |
| Confusion matrix | Shows which signs are mistaken for each other |
| Per-signer accuracy | Finds people the model fails for (e.g. left-handed or fast signers) |
| **Selective metrics** at thresholds 0.5 / 0.7 / 0.85 | *Coverage* (how often something is shown), *accuracy when shown*, and **wrong-sign-shown rate** (how often a wrong sign would reach the user). This is the key safety number |
| Expected calibration error (ECE) | Whether scores mean what they say. Confidence bands are shown in the app only if test ECE ≤ 0.05 |
| Latency per window | Median and p95 on a development CPU, **and** measured on target phones (see §5) |

## 3. Calibration

1. Fit a temperature on the **validation** signers (`fit_temperature`).
2. Measure ECE on the **test** signers.
3. The model pack sets `"calibrated": true` only if test ECE ≤ 0.05 (`MAX_CALIBRATED_ECE` in `inference/pack.py`). The app hides confidence bands and numbers for uncalibrated packs.

## 4. Release criteria (proposed, to be agreed with partners)

A model pack may replace the "recognition unavailable" state in the app only if:

- [ ] It was evaluated on ≥ 10 unseen signers, including left-handed signers
- [ ] **Wrong-sign-shown rate ≤ 2%** at the app's threshold (0.7) on test signers
- [ ] **Emergency signs:** wrong-sign-shown rate ≤ 0.5% at 0.85, and no emergency sign predicted for a non-emergency sample in the test set
- [ ] No sign has recall below 0.6; signs below that are removed from the pack's vocabulary
- [ ] Per-signer accuracy has no outlier signer below 0.5 without an explanation and follow-up
- [ ] Latency p95 < 300 ms per window on the reference low-end Android phone
- [ ] Pack size < 15 MB
- [ ] A model card (§6) is written and reviewed by ISL educators and the partner organization

Stabilizer defaults (`mobile/src/recognition/config.ts`) are tuned on **validation** data using the same selective metrics and then frozen before the test run.

## 5. On-device checks

Measure on at least one low-end and one mid-range Android phone:
- Windows per second sustained for 5 minutes (thermal throttling)
- Battery drain per 10 minutes of recognition
- Cold-start time to first prediction
- Memory use

## 6. Model card (published with every pack)

- Model ID, date, code commit, dataset version and split version
- Vocabulary (signs and their regional variants) and the unknown-class definition
- Number of training, validation and test signers, and their diversity summary
- All metrics from §2, the per-sign table, per-signer table and confusion matrix (`evaluation.md` is generated for each pack)
- Known failure modes (lighting, speed, handedness, occlusion)
- Intended use and out-of-scope use (not for medical, legal or emergency decisions; not an interpreter replacement)

## 7. Reproducibility

- Seeds are fixed for splits, initialization, data order and augmentation (`TrainConfig.seed`).
- `training_history.json`, `evaluation.json` and `evaluation.md` are written next to every pack.
- Results are reported with the exact commands used.

## 8. Current results

INCLUDE (262 signs, 4,276 videos, CC BY 4.0). For each sign the last recording session (730 videos) is the test set and the one before the validation set. INCLUDE does not say who signed each video, so test sessions may share signers with training ones; all signers are Deaf students of one school. Settings (temperature, when a sign is shown) were chosen on validation with a model trained without it (run A); the model measured is run B, which was also trained on the validation videos. The model in the app is trained on every recording with the same settings. Commands: [`sign-packs.md`](sign-packs.md#trained-models).

| Model | Model alone: top 1 / top 3 | Live: right on first try / wrong / "not sure" | Live: right sign on screen (shown or one tap away) | ECE | Calibrated |
| --- | --- | --- | --- | --- | --- |
| Whole-sign, 4 networks, + 205 ISLRTC dictionary videos in training (run B, shipped as trained on everything) | 84.9% / 94.8% | 72.5% / 5.5% / 22.1% | 94.2% | 0.056 | no |
| Same, run A (without the validation videos), on validation | 81.1% (val) | 64.7% / 4.3% / 31.1% (val) | 91.0% (val) | — | no |
| Same recipe with the ISL Bible dictionary (CC BY-SA) instead of ISLRTC (not shipped: its licence would make the model share-alike) | 85.5% / 95.1% | 73.3% / 5.2% / 21.5% | 94.5% | — | no |
| Whole-sign, 3 networks (previous shipped model, run B) | 83.3% / 92.9% | 64.0% / 4.8% / 31.2% | 92.3% | 0.06 | no |
| Same, run A (without the validation videos) | 77.7% / 89.6% | 55.1% / 5.1% / 39.9% | 87.1%* | 0.07 | no |
| Window model (previous, replaced) | 63% of windows | 32% / 4% / 64% | — | 0.19 | no |

**A signer the model never saw.** The [ISL Bible dictionary](https://huggingface.co/datasets/bridgeconn/sign-dictionary-isl) of Bridge Connectivity Solutions (CC BY-SA 4.0) has one or two videos per word by one signer, recorded outside INCLUDE; 156 of the 262 signs have a video with the same English word (197 videos). Analysed with `npm run export:landmarks` and played through the app's session (`tune:model --evaluate --split all`), the shipped model gets 21.8% right on the first try, 15.7% wrong, 62.4% "not sure", right sign on screen 50.3%; alone, 33.5% right and 51.3% in the top 3 (previous model: 15.2%, 15.2%, 69.5%, 36.0%; alone 25.4%, 37.6%). Adding a second source of signers to training (ISLRTC's dictionary, one video per sign for 205 signs) is what moved this; the reverse holds too: a model trained with the ISL Bible videos ranks the right sign first for 40.5% of ISLRTC's videos, against 34.1% for the INCLUDE-only model. Adding that signer's videos of half the signs to training did not help with the other half (one network: 14.4% → 12.5% right, 22.1% → 24.0% top 3): the model needs each sign from many signers. Some words may be regional variants or a different sense of the English word, so part of the gap is vocabulary, not recognition. The ISL Bible dataset is used for testing only; nothing from it is in the app.

**After teaching the app your signs** (docs/architecture.md §6.6). Simulated with INCLUDE's recordings, played through the app's `PersonalizedRecognizer`. The weights were chosen on validation sessions with run A and measured once on the test sessions.

| Scenario | Right on the first try | Wrong |
| --- | --- | --- |
| Same session, all signs taught with two takes, the third signed (run B, 658 takes) | 78.3% (model alone 65.2%) | 3.8% (4.7%) |
| Same, with signs the person's takes confirm shown from 0.3 | 82.1% | 4.0% |
| Taught in one session, signed in the next (run A, 614 videos) | 60.3% (60.1%) | 4.6% (5.4%) |
| Same, only half the signs taught: the taught ones | 60.1% (64.1%) | 7.0% (5.5%) |
| Same, only half the signs taught: the others | 59.2% (56.9%) | 4.1% (5.3%) |

It helps the person who taught, signing as they taught; if the teaching recordings differ from the signing (another person, or another day), it does not. INCLUDE does not say who signed each session, and the same person on another day has not been measured. Letting a clear movement match outweigh the model, the rule first tried, made things far worse with many signs taught (first try 60% → 3%).

Slow phones use MediaPipe's lite hand model. On one test video per sign (260), analysed with each: full 68.1% right on the first try, 4.2% wrong, right sign on screen 93.5%; lite 63.5%, 5.0%, 92.3%.

\* Measured when the app still hid suggestions below 3% probability; run B with that rule: 90.1%. The rule was dropped after it cost 1.4 points on validation.

"Live" means each test video was played frame by frame, with rest before and after, through the app's own `RecognitionSession` (`npm run tune:model -- --evaluate --split test`). Per sign: [`include-signs.md`](include-signs.md). Against §4 the model falls short on unseen signers (one signer measured: 22% right, 16% wrong), the wrong-sign rate (5.5% at the app's setting, target 2%) and per-sign recall (62 of the 260 tested signs are right on fewer than two thirds of their test videos). The most frequent confusions are pairs that may be one sign under two English words (male / man, female / woman, winter / cold, dirty / ugly; to be checked with Deaf signers, not merged by the app) and you / I, which differ in pointing towards or away from the camera, a direction the model's x/y inputs cannot see.

The automated tests train on **synthetic** geometric patterns only to prove that the pipeline works end to end. Those numbers say nothing about ISL and must never be reported as model performance.
