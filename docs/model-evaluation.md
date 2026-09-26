# Model evaluation

Status: **no trained model exists, so there are no results to report.** This document defines how every model must be evaluated before it can ship, and what must be published with it.

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

| Model | Dataset | Test signers | Macro F1 | Wrong sign shown @0.7 | Calibrated |
| --- | --- | --- | --- | --- | --- |
| *(none)* | *(no dataset yet)* | — | — | — | — |

The automated tests train on **synthetic** geometric patterns only to prove that the pipeline works end to end. Those numbers say nothing about ISL and must never be reported as model performance.
