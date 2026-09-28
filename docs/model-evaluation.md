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
| Whole-sign, 3 networks (run B, shipped as trained on everything) | 83.3% / 92.9% | 64.0% / 4.8% / 31.2% | 92.3% | 0.06 | no |
| Same, run A (without the validation videos) | 77.7% / 89.6% | 55.1% / 5.1% / 39.9% | 87.1%* | 0.07 | no |
| Window model (previous, replaced) | 63% of windows | 32% / 4% / 64% | — | 0.19 | no |

Slow phones use MediaPipe's lite hand model. On one test video per sign (260), analysed with each: full 68.1% right on the first try, 4.2% wrong, right sign on screen 93.5%; lite 63.5%, 5.0%, 92.3%.

\* Measured when the app still hid suggestions below 3% probability; run B with that rule: 90.1%. The rule was dropped after it cost 1.4 points on validation.

"Live" means each test video was played frame by frame, with rest before and after, through the app's own `RecognitionSession` (`npm run tune:model -- --evaluate --split test`). Per sign: [`include-signs.md`](include-signs.md). Against §4 the model falls short on unseen signers (not measured), the wrong-sign rate (4.8% at the app's setting, target 2%) and per-sign recall (84 of the 260 tested signs are right on fewer than two thirds of their test videos).

The automated tests train on **synthetic** geometric patterns only to prove that the pipeline works end to end. Those numbers say nothing about ISL and must never be reported as model performance.
