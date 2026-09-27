"""ModelTrainer: reproducible training with signer-independent early stopping."""

from __future__ import annotations

import copy
import random
from collections.abc import Callable
from dataclasses import asdict, dataclass, field

import numpy as np
import torch
from torch import nn
from torch.utils.data import DataLoader

from ..data.dataset import LandmarkWindowDataset
from ..evaluation.metrics import classification_report


@dataclass
class TrainConfig:
    epochs: int = 40
    batch_size: int = 32
    learning_rate: float = 2e-3
    weight_decay: float = 1e-2
    label_smoothing: float = 0.05
    patience: int = 8
    grad_clip: float = 1.0
    class_weighting: bool = True
    seed: int = 0
    device: str = "cpu"

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class TrainResult:
    best_epoch: int
    best_val_macro_f1: float
    history: list[dict] = field(default_factory=list)


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def class_weights(targets: list[int], num_classes: int) -> torch.Tensor:
    """Inverse-frequency weights so rare signs are not ignored."""
    counts = np.bincount(np.asarray(targets, dtype=int), minlength=num_classes).astype(float)
    weights = np.where(counts > 0, counts.sum() / (num_classes * np.maximum(counts, 1)), 0.0)
    return torch.tensor(weights, dtype=torch.float32)


class ModelTrainer:
    def __init__(self, config: TrainConfig | None = None, log: Callable[[str], None] = print):
        self.config = config or TrainConfig()
        self.log = log

    @torch.no_grad()
    def _validate(self, model: nn.Module, dataset: LandmarkWindowDataset) -> dict:
        model.eval()
        preds, targets = [], []
        for x, y in DataLoader(dataset, batch_size=128, shuffle=False):
            preds.append(model(x.to(self.config.device)).argmax(dim=1).cpu().numpy())
            targets.append(y.numpy())
        if not preds:
            return {"accuracy": 0.0, "macro_f1": 0.0}
        return classification_report(np.concatenate(targets), np.concatenate(preds), dataset.labels)

    def fit(
        self, model: nn.Module, train: LandmarkWindowDataset, val: LandmarkWindowDataset | None
    ) -> TrainResult:
        """Train ``model`` in place and leave it holding the best validation weights.

        With ``val=None`` it trains for exactly ``epochs`` and keeps the last
        weights: for a final model trained on every recording, with the epoch
        count found on a held-out split.
        """
        cfg = self.config
        if len(train) == 0:
            raise ValueError("training set is empty")
        if val is not None and len(val) == 0:
            raise ValueError("validation set is empty: need held-out signers for early stopping")
        set_seed(cfg.seed)
        model.to(cfg.device)
        generator = torch.Generator().manual_seed(cfg.seed)
        loader = DataLoader(
            train, batch_size=cfg.batch_size, shuffle=True, generator=generator, drop_last=False
        )
        num_classes = len(train.labels)
        weight = class_weights(train.targets, num_classes).to(cfg.device) if cfg.class_weighting else None
        criterion = nn.CrossEntropyLoss(weight=weight, label_smoothing=cfg.label_smoothing)
        optimizer = torch.optim.AdamW(model.parameters(), lr=cfg.learning_rate, weight_decay=cfg.weight_decay)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(cfg.epochs, 1))

        best_f1, best_epoch, best_state, stale = -1.0, -1, None, 0
        history: list[dict] = []
        for epoch in range(cfg.epochs):
            model.train()
            total, count = 0.0, 0
            for x, y in loader:
                x, y = x.to(cfg.device), y.to(cfg.device)
                optimizer.zero_grad()
                loss = criterion(model(x), y)
                loss.backward()
                nn.utils.clip_grad_norm_(model.parameters(), cfg.grad_clip)
                optimizer.step()
                total += loss.item() * len(y)
                count += len(y)
            scheduler.step()
            if val is None:
                history.append({"epoch": epoch, "train_loss": total / max(count, 1)})
                self.log(f"epoch {epoch:3d}  loss {total / max(count, 1):.4f}")
                continue
            val_report = self._validate(model, val)
            row = {
                "epoch": epoch,
                "train_loss": total / max(count, 1),
                "val_accuracy": val_report["accuracy"],
                "val_macro_f1": val_report["macro_f1"],
            }
            history.append(row)
            self.log(
                f"epoch {epoch:3d}  loss {row['train_loss']:.4f}  "
                f"val acc {row['val_accuracy']:.3f}  val macro-F1 {row['val_macro_f1']:.3f}"
            )
            if row["val_macro_f1"] > best_f1:
                best_f1, best_epoch, stale = row["val_macro_f1"], epoch, 0
                best_state = copy.deepcopy(model.state_dict())
            else:
                stale += 1
                if stale >= cfg.patience:
                    self.log(f"early stop at epoch {epoch} (best {best_epoch})")
                    break
        if val is None:
            return TrainResult(best_epoch=cfg.epochs - 1, best_val_macro_f1=float("nan"), history=history)
        if best_state is not None:
            model.load_state_dict(best_state)
        return TrainResult(best_epoch=best_epoch, best_val_macro_f1=best_f1, history=history)
