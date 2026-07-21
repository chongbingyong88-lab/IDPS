"""Model definitions and training for the three-way comparison.

Assignment 1 objective: compare Random Forest, SVM and XGBoost on accuracy,
interpretability and computational efficiency.

Efficiency measurements taken here (for the IoT/edge feasibility objective):
  * training wall-clock time
  * serialized model size (joblib)
  * batch inference latency per sample
"""

import time

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedKFold, cross_validate, train_test_split
from sklearn.svm import SVC
from xgboost import XGBClassifier

from . import config


def make_models(scale_pos_weight: float) -> dict:
    """The three classifiers, all cost-sensitive to handle class imbalance."""
    return {
        "rf": RandomForestClassifier(
            n_estimators=200,
            class_weight="balanced",
            n_jobs=-1,
            random_state=config.SEED,
        ),
        "svm": SVC(
            kernel="rbf",
            C=1.0,
            gamma="scale",
            class_weight="balanced",
            cache_size=1000,
            random_state=config.SEED,
        ),
        "xgb": XGBClassifier(
            n_estimators=300,
            max_depth=8,
            learning_rate=0.1,
            subsample=0.9,
            colsample_bytree=0.9,
            scale_pos_weight=scale_pos_weight,
            tree_method="hist",
            eval_metric="logloss",
            n_jobs=-1,
            random_state=config.SEED,
        ),
    }


def train_one(name: str, model, X_train, y_train) -> dict:
    """Fit a model, recording its training time and serialized size.

    The RBF-SVM kernel matrix scales quadratically with training size, so the
    SVM is fitted on a stratified subsample - itself a finding for the edge
    feasibility objective (full-set kernel SVM training is impractical).
    """
    X_fit, y_fit = X_train, y_train
    if name == "svm" and len(X_train) > config.SVM_TRAIN_SAMPLES:
        X_fit, _, y_fit, _ = train_test_split(
            X_train, y_train,
            train_size=config.SVM_TRAIN_SAMPLES,
            stratify=y_train,
            random_state=config.SEED,
        )

    t0 = time.perf_counter()
    model.fit(X_fit, y_fit)
    train_time = time.perf_counter() - t0

    config.MODELS_DIR.mkdir(parents=True, exist_ok=True)
    path = config.MODELS_DIR / f"{name}.joblib"
    joblib.dump(model, path, compress=3)

    return {
        "train_time_s": round(train_time, 2),
        "train_rows": len(X_fit),
        "model_size_kb": round(path.stat().st_size / 1024, 1),
    }


def inference_latency(model, X_test, repeats: int = 3) -> dict:
    """Batch inference latency, reported per sample (edge feasibility)."""
    times = []
    for _ in range(repeats):
        t0 = time.perf_counter()
        model.predict(X_test)
        times.append(time.perf_counter() - t0)
    best = min(times)
    return {
        "batch_time_s": round(best, 3),
        "latency_us_per_sample": round(best / len(X_test) * 1e6, 2),
        "throughput_samples_per_s": int(len(X_test) / best),
    }


def cross_validate_model(model, X_train, y_train) -> dict:
    """5-fold stratified CV (RF/XGBoost only - kernel SVM is too costly)."""
    cv = StratifiedKFold(n_splits=config.CV_FOLDS, shuffle=True, random_state=config.SEED)
    scores = cross_validate(model, X_train, y_train, cv=cv,
                            scoring=["accuracy", "f1"], n_jobs=1)
    return {
        "cv_accuracy_mean": round(float(np.mean(scores["test_accuracy"])), 4),
        "cv_accuracy_std": round(float(np.std(scores["test_accuracy"])), 4),
        "cv_f1_mean": round(float(np.mean(scores["test_f1"])), 4),
        "cv_f1_std": round(float(np.std(scores["test_f1"])), 4),
    }
