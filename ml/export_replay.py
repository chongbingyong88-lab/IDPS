"""Export trained-XGBoost verdicts on real UNSW-NB15 test flows for the dashboard.

This is the integration point between the ML pipeline and the live dashboard:
the model trained in run_pipeline.py classifies the genuine held-out test flows,
and its per-flow verdicts (with ground-truth labels and raw display features) are
written to data/unsw-replay.json. The dashboard's "UNSW-NB15 Replay" panel then
streams these real flows and recomputes accuracy/precision/recall/FPR live,
converging to the benchmark numbers - so the dataset itself drives the demo.

Run AFTER run_pipeline.py (needs results/models/xgb.joblib):
    python export_replay.py
"""

import json
import time

import joblib
import numpy as np
from sklearn.model_selection import train_test_split

from src import config, preprocess

N_FLOWS = 1500          # sampled proportionally by attack family
DISPLAY_COLS = ["proto", "service", "state", "sbytes", "dbytes", "sttl",
                "dttl", "dur", "rate", "dpkts", "spkts"]


def main() -> None:
    model_path = config.MODELS_DIR / "xgb.joblib"
    if not model_path.exists():
        raise FileNotFoundError(
            f"{model_path} not found - run `python run_pipeline.py` first.")

    # Rebuild the exact same preprocessing + split the model was evaluated on.
    ds = preprocess.build_dataset()
    model = joblib.load(model_path)

    proba = model.predict_proba(ds.X_test)[:, 1]
    pred = (proba >= 0.5).astype(int)
    actual = ds.y_test
    family = ds.attack_cat_test.to_numpy()

    # Recover the raw (un-encoded) test rows, aligned row-for-row with X_test:
    # identical clean() + identical split params => identical partition.
    df, _ = preprocess.clean(preprocess.load_raw())
    X_raw = df.drop(columns=["label", "attack_cat"]).reset_index(drop=True)
    _, X_raw_te = train_test_split(
        X_raw, test_size=config.TEST_SIZE,
        stratify=df["attack_cat"], random_state=config.SEED)
    X_raw_te = X_raw_te.reset_index(drop=True)
    assert len(X_raw_te) == len(actual), "raw/transformed test split misaligned"

    # Proportional sample per family (keeps the class mix realistic).
    rng = np.random.RandomState(config.SEED)
    idx_all = np.arange(len(actual))
    chosen: list[int] = []
    for fam in np.unique(family):
        fam_idx = idx_all[family == fam]
        take = max(1, round(len(fam_idx) / len(actual) * N_FLOWS))
        take = min(take, len(fam_idx))
        chosen.extend(rng.choice(fam_idx, size=take, replace=False).tolist())
    rng.shuffle(chosen)

    flows = []
    for i in chosen:
        row = X_raw_te.iloc[i]
        flows.append({
            "proto": str(row["proto"]),
            "service": str(row["service"]),
            "state": str(row["state"]),
            "sbytes": int(row["sbytes"]),
            "dbytes": int(row["dbytes"]),
            "sttl": int(row["sttl"]),
            "dur": round(float(row["dur"]), 4),
            "rate": round(float(row["rate"]), 1),
            "family": str(family[i]),
            "actual": int(actual[i]),           # 1 = attack, 0 = benign
            "predicted": int(pred[i]),
            "proba": round(float(proba[i]), 4),  # model's attack probability
        })

    out = {
        "model": "XGBoost",
        "dataset": "UNSW-NB15 (held-out test set)",
        "generatedAt": time.strftime("%Y-%m-%d"),
        "totalTestFlows": int(len(actual)),
        "sampledFlows": len(flows),
        "featureVector": ds.feature_names,
        "flows": flows,
    }
    out_path = config.REPO_DIR / "data" / "unsw-replay.json"
    out_path.write_text(json.dumps(out))
    print(f"Wrote {out_path}")
    print(f"  {len(flows)} flows sampled from {len(actual):,} test flows")
    n_atk = sum(f["actual"] for f in flows)
    correct = sum(f["actual"] == f["predicted"] for f in flows)
    print(f"  {n_atk} attack / {len(flows)-n_atk} benign; "
          f"sample accuracy {correct/len(flows):.3f}")


if __name__ == "__main__":
    main()
