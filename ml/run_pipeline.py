"""End-to-end UNSW-NB15 benchmark pipeline.

Implements the supervised-learning methodology proposed in Assignment 1:

  1. Data collection & preparation   (download_data.py + preprocess.clean)
  2. Feature engineering             (encode + normalize + mutual-info selection)
  3. Dataset splitting               (stratified 70/30)
  4. Model training                  (Random Forest, RBF-SVM, XGBoost)
  5. Model evaluation                (accuracy/precision/recall/F1/FPR/ROC-AUC/
                                      PR-AUC, per-attack-family recall, 5-fold CV,
                                      edge feasibility: size + latency)
  6. Explainability                  (feature importance + SHAP)

Usage:
    python run_pipeline.py            # full run (~5-10 min)
    python run_pipeline.py --fast     # reduced settings for a quick smoke test

Outputs:
    results/metrics.json              # every number used in the report
    results/metrics_summary.csv       # model x metric table
    results/figures/fig*.png          # report figures
    ../data/benchmark-results.json    # trimmed copy for the dashboard panel
"""

import argparse
import json
import sys
import time

import pandas as pd

from src import config, evaluate, explain, models, preprocess


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fast", action="store_true",
                        help="smaller models/subsamples for a quick smoke test")
    args = parser.parse_args()

    if args.fast:
        config.SVM_TRAIN_SAMPLES = 4_000
        config.MI_SAMPLE = 8_000
        config.SHAP_SAMPLE = 500
        config.CV_FOLDS = 3

    t_start = time.time()
    evaluate.apply_style()

    # ---- 1-3. Load, clean, encode, normalize, select, split ----------------
    print("[1/4] Preprocessing UNSW-NB15 ...")
    ds = preprocess.build_dataset()
    info = ds.info
    print(f"      rows: {info['rows_raw']:,} raw -> {info['rows_clean']:,} clean "
          f"({info['duplicates_removed']} duplicates removed, "
          f"{info['missing_values']} missing values imputed)")
    print(f"      features: {info['n_numeric']} numeric + {info['n_categorical']} "
          f"categorical -> {info['n_features_encoded']} encoded -> "
          f"{info['n_features_selected']} selected")
    print(f"      split: {info['rows_train']:,} train / {info['rows_test']:,} test")

    raw = preprocess.load_raw()
    evaluate.fig_class_distribution(raw["attack_cat"].value_counts())
    evaluate.fig_feature_selection(ds.mi_ranking)

    # ---- 4. Train ----------------------------------------------------------
    print("[2/4] Training models ...")
    zoo = models.make_models(info["scale_pos_weight"])
    results: dict[str, dict] = {}
    for name, model in zoo.items():
        print(f"      training {config.MODEL_LABELS[name]} ...")
        eff = models.train_one(name, model, ds.X_train, ds.y_train)
        results[name] = {"model": model, "efficiency": eff}
        print(f"        {eff['train_time_s']}s on {eff['train_rows']:,} rows, "
              f"{eff['model_size_kb']:,.0f} KB serialized")

    # ---- 5. Evaluate -------------------------------------------------------
    print("[3/4] Evaluating on the held-out test set ...")
    for name, res in results.items():
        model = res["model"]
        y_pred = model.predict(ds.X_test)
        res["scores"] = evaluate.decision_scores(model, ds.X_test)
        res["metrics"] = evaluate.compute_metrics(ds.y_test, y_pred, res["scores"])
        res["per_family"] = evaluate.per_family_recall(ds.y_test, y_pred,
                                                       ds.attack_cat_test)
        res["efficiency"].update(models.inference_latency(model, ds.X_test))
        if name in ("rf", "xgb"):
            res["cv"] = models.cross_validate_model(models.make_models(
                info["scale_pos_weight"])[name], ds.X_train, ds.y_train)
        m = res["metrics"]
        print(f"      {config.MODEL_LABELS[name]:14s} acc={m['accuracy']:.4f} "
              f"prec={m['precision']:.4f} rec={m['recall']:.4f} f1={m['f1']:.4f} "
              f"fpr={m['fpr']:.4f} auc={m['roc_auc']:.4f}")

    evaluate.fig_confusion_matrices(results)
    evaluate.fig_roc_pr_curves(results, ds.y_test)
    evaluate.fig_model_comparison(results)
    evaluate.fig_per_family(results)
    evaluate.fig_edge_feasibility(results)

    # ---- 6. Explain --------------------------------------------------------
    print("[4/4] Explainability (feature importance + SHAP) ...")
    importances = explain.fig_feature_importance(
        results["rf"]["model"], results["xgb"]["model"], ds.feature_names)
    shap_top = explain.fig_shap_summary(
        results["xgb"]["model"], ds.X_test, ds.feature_names)

    # ---- Persist results ---------------------------------------------------
    out = {
        "dataset": {
            "name": "UNSW-NB15 (official partition CSV)",
            "source": "Moustafa & Slay, MilCIS 2015",
            **{k: v for k, v in info.items()},
            "selected_features": ds.feature_names,
        },
        "models": {
            name: {
                "label": config.MODEL_LABELS[name],
                "metrics": res["metrics"],
                "per_family": res["per_family"],
                "efficiency": res["efficiency"],
                **({"cv": res["cv"]} if "cv" in res else {}),
            }
            for name, res in results.items()
        },
        "explainability": {
            "top_importances": importances,
            "shap_top_features": shap_top,
        },
        "runtime_s": round(time.time() - t_start, 1),
        "fast_mode": args.fast,
    }
    config.RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    config.METRICS_JSON.write_text(json.dumps(out, indent=2))

    rows = [{"model": config.MODEL_LABELS[n], **r["metrics"],
             **{k: r["efficiency"][k] for k in
                ("train_time_s", "model_size_kb", "latency_us_per_sample")}}
            for n, r in results.items()]
    pd.DataFrame(rows).to_csv(config.SUMMARY_CSV, index=False)

    # Trimmed copy for the Next.js dashboard benchmark panel.
    dashboard = {
        "dataset": "UNSW-NB15",
        "records": info["rows_clean"],
        "testRecords": info["rows_test"],
        "featuresSelected": info["n_features_selected"],
        "featuresEncoded": info["n_features_encoded"],
        "generatedAt": time.strftime("%Y-%m-%d"),
        "models": [
            {
                "id": name,
                "label": config.MODEL_LABELS[name],
                "accuracy": res["metrics"]["accuracy"],
                "precision": res["metrics"]["precision"],
                "recall": res["metrics"]["recall"],
                "f1": res["metrics"]["f1"],
                "fpr": res["metrics"]["fpr"],
                "rocAuc": res["metrics"]["roc_auc"],
                "modelSizeKb": res["efficiency"]["model_size_kb"],
                "latencyUs": res["efficiency"]["latency_us_per_sample"],
                "perFamily": res["per_family"],
            }
            for name, res in results.items()
        ],
        "topFeatures": ds.feature_names[:10],
    }
    config.DASHBOARD_JSON.write_text(json.dumps(dashboard, indent=2))

    print(f"\nDone in {out['runtime_s']}s.")
    print(f"  metrics : {config.METRICS_JSON}")
    print(f"  figures : {config.FIGURES_DIR}")
    print(f"  dashboard data: {config.DASHBOARD_JSON}")


if __name__ == "__main__":
    sys.exit(main())
