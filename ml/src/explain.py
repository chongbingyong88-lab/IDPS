"""Explainability: built-in feature importances + SHAP values.

Assignment 1 objective: make the model transparent by identifying which
features drive the malicious-traffic classification (analyst trust).
"""

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

from . import config

C = config.COLORS


def fig_feature_importance(rf_model, xgb_model, feature_names: list[str]) -> dict:
    """Side-by-side top-15 impurity importances for the two tree ensembles."""
    imp = {
        "rf": pd.Series(rf_model.feature_importances_, index=feature_names),
        "xgb": pd.Series(xgb_model.feature_importances_, index=feature_names),
    }
    fig, axes = plt.subplots(1, 2, figsize=(10.5, 5))
    for ax, name in zip(axes, imp):
        top = imp[name].sort_values().tail(15)
        ax.barh(top.index, top.values, color=C[name], height=0.62)
        ax.set_title(f"{config.MODEL_LABELS[name]} importance", loc="left",
                     fontsize=11, color=C["ink"])
        ax.grid(axis="y", visible=False)
        ax.tick_params(labelsize=8)
    fig.tight_layout()
    config.FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    fig.savefig(config.FIGURES_DIR / "fig7_feature_importance.png", bbox_inches="tight")
    plt.close(fig)

    return {name: s.sort_values(ascending=False).head(10).round(4).to_dict()
            for name, s in imp.items()}


def fig_shap_summary(xgb_model, X_test: np.ndarray, feature_names: list[str]) -> list[str]:
    """SHAP beeswarm for the XGBoost model on a test subsample.

    Returns the top features ranked by mean |SHAP| (used in the report).
    SHAP is optional at runtime: if the library is unavailable the pipeline
    still completes, falling back to the impurity importances above.
    """
    try:
        import shap
    except ImportError:
        print("  [explain] shap not installed - skipping SHAP summary plot")
        return []

    rng = np.random.RandomState(config.SEED)
    idx = rng.choice(len(X_test), size=min(config.SHAP_SAMPLE, len(X_test)), replace=False)
    sample = pd.DataFrame(X_test[idx], columns=feature_names)

    explainer = shap.TreeExplainer(xgb_model)
    values = explainer.shap_values(sample)

    plt.figure()
    shap.summary_plot(values, sample, show=False, max_display=15, plot_size=(9, 6))
    fig = plt.gcf()
    fig.patch.set_facecolor(C["surface"])
    fig.suptitle("SHAP summary — XGBoost (impact on attack probability)",
                 x=0.01, ha="left", fontsize=11, color=C["ink"])
    fig.tight_layout(rect=[0, 0, 1, 0.96])
    fig.savefig(config.FIGURES_DIR / "fig9_shap_summary.png", bbox_inches="tight")
    plt.close(fig)

    ranking = pd.Series(np.abs(values).mean(axis=0), index=feature_names)
    return list(ranking.sort_values(ascending=False).head(10).index)
