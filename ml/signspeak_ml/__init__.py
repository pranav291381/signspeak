"""ISL Connect ML pipeline.

video -> landmarks (FeatureExtractor) -> normalized feature sequence (feature spec v1)
-> temporal classifier -> calibrated scores -> (on device) stabilizer -> text.

Nothing in this package ships a trained model. Models must be trained on an
authorized, consented dataset (docs/dataset.md) and evaluated on signers who were
not in the training data (docs/model-evaluation.md).
"""

__version__ = "0.1.0"
