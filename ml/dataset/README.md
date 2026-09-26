# Dataset mount point

This folder holds a **locally mounted, authorized** ISL dataset. Its contents are gitignored and must never be committed.

```
raw/          original recordings (video)
processed/    <sample_id>.npy landmark features (feature spec v1)
annotations/  annotations.jsonl
splits/       <version>.json signer-level splits
```

Collection, consent, anonymization, annotation format, splits, licensing and deletion rules are in [`docs/dataset.md`](../../docs/dataset.md).

To use a dataset stored elsewhere, set `SIGNSPEAK_DATASET_ROOT=/path/to/dataset` or pass `--root`.
