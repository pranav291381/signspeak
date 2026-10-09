# Dataset

Status: **no dataset exists yet.** This document defines how one must be collected, stored and used. It is an engineering and ethics baseline that needs review by the partner NGO, qualified ISL educators, Deaf community representatives, and legal counsel (DPDP Act 2023) before any recording starts.

## 1. Principles

1. **Consent first.** No recording without informed, specific, revocable consent, explained in ISL by a fluent signer as well as in writing in the participant's language.
2. **Deaf-led content.** Signs are performed by fluent Deaf ISL users. Selection of signs and variants is decided with qualified ISL educators.
3. **Minimum data.** Record only what the model needs (upper body and hands, see §6). Store no names or contact details in the dataset.
4. **Signer-independent evaluation.** People in the test set never appear in training (§8).
5. **Nothing leaves local storage without approval.** Recordings are never uploaded to third-party services, including cloud ML tools, without explicit approval from the data steward and consent that covers it.

## 2. Roles

| Role | Responsibility |
| --- | --- |
| Data steward (partner organization) | Holds the consent register and the pseudonym ↔ identity mapping; approves access; handles deletion requests |
| ISL educators / Deaf reviewers | Choose vocabulary and regional variants; verify annotations |
| Annotators | Label segments; never see the consent register |
| Engineers | Work only with pseudonymized data under an access agreement |

## 3. Collection process

1. **Vocabulary selection** with ISL educators (see `docs/product-spec.md` §6). Record the chosen regional variant and its source for each sign.
2. **Participant information session** in ISL: purpose, what is recorded, who can see it, how long it is kept, the right to withdraw, and that participation is voluntary and unpaid or paid as agreed.
3. **Consent** captured on the partner's form. It includes separate opt-ins for:
   - (a) training and evaluation use
   - (b) use of the recording as a *demonstration* in the app (this needs a stronger opt-in because the face is visible)
   - (c) sharing with named research partners
4. **Recording sessions** with a script of signs, repeated across sessions. Include natural variation (§7).
5. **Negative/"unknown" examples:** non-sign movements, transitions, scratching, waving, and signs outside the vocabulary, labelled `__unknown__`. These teach the model to say "not sure".
6. **Quality check** by a second fluent signer.

## 4. Storage layout

The dataset lives outside git (the repository's `.gitignore` blocks it) and is mounted at `ml/dataset/` or pointed to by `SIGNSPEAK_DATASET_ROOT`.

```
<root>/
  raw/<signer_id>/<clip>.mp4        original recordings (encrypted at rest)
  processed/<sample_id>.npy         landmark features, feature spec v1 (T × 156, 15 fps)
  annotations/annotations.jsonl     one sample per line (§5)
  splits/<version>.json             signer-level split (§8)
  DATASET_CARD.md                   version, contents, licence, known gaps
```

Access is limited to named people and granted by the data steward. Laptops holding raw video must use full-disk encryption.

## 5. Annotation format

One JSON object per line. The format is validated by `signspeak-ml validate-annotations` (`ml/signspeak_ml/data/annotations.py`).

```json
{"sample_id": "s000123", "signer_id": "sg_0042", "label": "hello",
 "video": "sg_0042/clip_0007.mp4", "start_ms": 1200, "end_ms": 2900,
 "language_context": "isl",
 "metadata": {"consent_ref": "c-2026-0042", "annotator_id": "an_03", "annotation_version": 1,
              "handedness": "right", "camera": "phone_front", "lighting": "indoor",
              "background": "plain", "distance": "medium", "region": "north"}}
```

| Field | Meaning |
| --- | --- |
| `sample_id` | Unique ID of this segment |
| `signer_id` | **Pseudonym** `sg_…`. Real identity is only in the consent register |
| `label` | Sign ID (matches `mobile/src/content/data/signs.json`), or `__unknown__` |
| `video` | Path relative to `raw/` (no absolute paths, no `..`) |
| `start_ms`, `end_ms` | Segment boundaries in the video |
| `language_context` | `isl` (reserved for future regional or contextual tags) |
| `metadata.consent_ref` | **Required.** Reference to the consent record (not personal data) |
| `metadata.annotator_id` | **Required.** Pseudonymous annotator ID |
| `metadata.annotation_version` | **Required.** Annotation guideline version |
| Other metadata | `handedness`, `camera`, `lighting`, `background`, `distance`, `region`, `quality`, `notes` |

The validator **rejects** personal-data fields (`name`, `phone`, `email`, `address`, `dob`, `age`, `aadhaar`, …), signer IDs that are not pseudonyms, and paths that escape `raw/`.

## 6. Signer anonymization

- The dataset stores pseudonyms only. The mapping is kept by the data steward, encrypted, separate from the data.
- Raw video necessarily shows the face, because non-manual markers are part of ISL. Raw video is therefore **never** published, and it is used for demonstrations only with opt-in (b).
- Processed features contain body and hand landmarks only (no face in feature spec v1), which greatly reduces re-identification risk. They should still be treated as personal data, since movement patterns can be identifying.
- Metadata is kept coarse (e.g. `region: north`, not a city or address).

## 7. Diversity targets

Aim for variation along every axis, and record it in metadata so evaluation can be sliced:

- **Signers:** many people (target ≥ 30 for a pilot vocabulary, ≥ 100 long-term), across genders, ages and regions, with both native and later-learning signers
- **Handedness:** left- and right-dominant signers
- **Speed:** natural, slow and fast signing
- **Camera:** different phones, front and back cameras, handheld and propped
- **Distance and framing:** close, medium and far; partially cropped
- **Lighting:** daylight, indoor tube light, low light, backlit
- **Backgrounds:** plain, cluttered, outdoor, other people in view
- **Sign types:** one-handed and two-handed signs, and signs near the face and near the body

## 8. Train / validation / test splits

- Splits are **by signer**: `signspeak-ml make-splits` assigns whole people to train, validation or test (`ml/signspeak_ml/data/splits.py`). The loader refuses split files where a signer appears in two splits.
- Default: 70% / 15% / 15% of signers, seeded and saved as `splits/<version>.json`.
- Splits are **versioned and immutable**. A new split gets a new version and never overwrites an old one, so reported results stay reproducible.
- The **test signers are held out.** They are used once per model release, not for tuning. Validation signers are used for early stopping and calibration.
- The tool warns when a sign has no samples in validation or test, because that sign cannot be evaluated.

## 9. Licensing

- The dataset licence must be agreed with the partner organization and participants before collection. It must be compatible with the consent given; for example, "research use by the project team only" is a valid choice.
- The licence goes in `DATASET_CARD.md`. The code repository's licence (not chosen yet) does not apply to the data.
- Demonstration media shown in the app need their own licence and consent reference (see `mobile/src/content/types.ts`, `SignMedia`).

## 10. Privacy

- No recordings are made by the app. Collection is a separate, supervised activity.
- Raw video stays on encrypted storage controlled by the partner.
- No upload to third-party services, including hosted notebooks and labelling platforms, without the data steward's written approval and consent coverage.
- Access is logged by the data steward.

## 11. Withdrawal and deletion

1. A participant asks the data steward (or partner staff) to withdraw.
2. The data steward looks up their pseudonym and deletes their raw videos, processed features and annotation lines, then records the deletion.
3. A new dataset version is published without them. Splits are regenerated as a new version.
4. Models trained on earlier versions are retrained at the next release, and the model card records which dataset version it used.

## 12. Public data sources checked

Recognizing people the model has never seen needs each sign from many signers. These are the Indian Sign Language sources checked so far and what they can be used for (September 2026). Nothing is used beyond what its licence or its owner allows.

| Source | What it has | Licence / access | Used for |
| --- | --- | --- | --- |
| [INCLUDE](https://zenodo.org/records/4010759) (AI4Bharat / IIT Madras) | 262 signs, 4,276 videos, Deaf students of one school in Chennai | CC BY 4.0 | Training and testing the included model |
| [ISL Bible (ISLV) Dictionary](https://huggingface.co/datasets/bridgeconn/sign-dictionary-isl) (Bridge Connectivity Solutions) | 3,077 words, about one video each, one signer; 156 of INCLUDE's signs | CC BY-SA 4.0 | Testing only, as a signer the model never saw. Training on it measured as well as ISLRTC (73.3% vs 72.5% first try) but would make the model pack CC BY-SA too, so it is not used (owner decision pending) |
| RKMVERI isolated ISL dataset ([arXiv 2407.14224](https://arxiv.org/abs/2407.14224)) | 2,002 words, 20 Deaf signers (10 women, 10 men), 40,033 videos | Research use only; not downloadable yet | Permission for use in the app requested by the owner (pending) |
| [CISLR](https://aclanthology.org/2022.emnlp-main.707/) (IIT Kanpur) | 4,765 words, 7,050 videos, 71 signers | Dataset AFL-3.0, gated; videos scraped from YouTube (ISLRTC and an ISL dictionary channel) | Not used: the video owners' permission would be needed |
| [ISLRTC Indian Sign Language Dictionary (till January 2024)](https://www.data.gov.in/resource/indian-sign-language-dictionary-till-january-2024) (Government of India) | 10,000+ signs, about one video each; 205 of INCLUDE's signs by English word | [Government Open Data License – India](https://data.gov.in/government-open-data-license-india) (use, adapt, share, also commercially, with attribution) on data.gov.in; a [re-encoded copy](https://huggingface.co/datasets/Vignesh3816/Indian_Sign_Language_Data.gov_Rencoded) on Hugging Face | **Training** the included model (205 videos, one per sign, landmarks only; credited in the pack). Earlier marked "needs permission" before its open licence on data.gov.in was found |

## 13. Signs exported from the app

People can teach the app their own signs (My signs) and export them with **My signs → Export my signs**: a JSON file (`signspeak-my-signs-<date>.json`) with the hand and body points of each take (no video) and the word, letter or model sign each one means. The app never uploads it; the person shares it themselves. These recordings can cover words and signing styles that no public dataset has.

Before such a file is used for training:

1. **Agreement.** The contributor agrees in writing (a message is enough for a pilot) that their signs may be used to train SignSpeak's models, for how long they are kept, and that they can withdraw at any time. Children only with a parent's or guardian's agreement.
2. **Pseudonym.** Give the contributor an ID (`c01`, `c02`, …) and keep the name ↔ ID list with the data steward only. The export itself holds no name, but custom words the person typed may be personal (a name, a place): review them, and drop any that should not be kept.
3. **Storage.** Keep export files with the other raw data (§4), never in git.
4. **Convert:** `python ml/scripts/import_my_signs.py <exports…> --contributor c01 --out my-signs-c01.jsonl` writes the takes of the model's signs as training recordings (`--own` adds own words and letters, for a future vocabulary). Several exports of the same person can be given at once: each holds everything taught so far, so takes they share are written once. Takes that cannot be read are skipped and counted. Add them with `train_segments.py --extra my-signs-c01.jsonl`; extra recordings are used for training only, never for testing.
5. **Withdrawal** follows §11: delete the contributor's files and JSONL and retrain at the next release.

## 14. Dataset versioning

- Use semantic versions (`1.0.0`). Adding samples is a minor bump. Removing samples (for example after a withdrawal) or changing labels is a major bump.
- Each version has a `DATASET_CARD.md` with sample counts per sign and per split, number of signers, diversity summary, known gaps, licence and changelog.
- Model packs record the dataset version and split version they were trained and evaluated on (`manifest.json` → `dataset`).
