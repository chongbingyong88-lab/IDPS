"""Evaluation metrics and report figures.

Metrics follow the Assignment 1 objective list: accuracy, precision, recall,
F1, false-positive rate, ROC-AUC and PR-AUC, plus a per-attack-family recall
breakdown (possible because `attack_cat` was kept aside during training).
"""

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    precision_recall_curve,
    roc_auc_score,
    roc_curve,
)

from . import config

C = config.COLORS


def apply_style() -> None:
    plt.rcParams.update({
        "figure.facecolor": C["surface"],
        "axes.facecolor": C["surface"],
        "savefig.facecolor": C["surface"],
        "text.color": C["ink"],
        "axes.edgecolor": C["muted"],
        "axes.labelcolor": C["ink2"],
        "xtick.color": C["ink2"],
        "ytick.color": C["ink2"],
        "axes.grid": True,
        "grid.color": C["grid"],
        "grid.linewidth": 0.8,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "font.size": 10,
        "figure.dpi": 150,
    })


def decision_scores(model, X) -> np.ndarray:
    """Continuous score for ROC/PR curves (probability or margin)."""
    if hasattr(model, "predict_proba"):
        return model.predict_proba(X)[:, 1]
    return model.decision_function(X)


def compute_metrics(y_true, y_pred, scores) -> dict:
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return {
        "tp": int(tp), "fp": int(fp), "tn": int(tn), "fn": int(fn),
        "accuracy": round((tp + tn) / len(y_true), 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(2 * precision * recall / (precision + recall), 4)
              if precision + recall else 0.0,
        "fpr": round(fp / (fp + tn), 4) if fp + tn else 0.0,
        "roc_auc": round(float(roc_auc_score(y_true, scores)), 4),
        "pr_auc": round(float(average_precision_score(y_true, scores)), 4),
    }


def per_family_recall(y_true, y_pred, attack_cat) -> dict:
    """Detection rate for each attack family + specificity for Normal."""
    out = {}
    for family in sorted(attack_cat.unique()):
        mask = (attack_cat == family).to_numpy()
        preds = y_pred[mask]
        if family == "Normal":
            out[family] = round(float((preds == 0).mean()), 4)  # specificity
        else:
            out[family] = round(float((preds == 1).mean()), 4)  # recall
    return out


# --------------------------------------------------------------------------
# Figures
# --------------------------------------------------------------------------

def _save(fig, name: str) -> None:
    config.FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    fig.savefig(config.FIGURES_DIR / name, bbox_inches="tight")
    plt.close(fig)


def fig_class_distribution(df_counts: pd.Series) -> None:
    counts = df_counts.sort_values()
    fig, ax = plt.subplots(figsize=(7, 4))
    colors = ["#008300" if k == "Normal" else C["rf"] for k in counts.index]
    ax.barh(counts.index, counts.values, color=colors, height=0.62)
    for i, v in enumerate(counts.values):
        ax.text(v, i, f" {v:,}", va="center", fontsize=8.5, color=C["ink2"])
    ax.set_xlabel("Records")
    ax.set_title("UNSW-NB15 class distribution (green = benign)", loc="left",
                 fontsize=11, color=C["ink"])
    ax.grid(axis="y", visible=False)
    ax.set_xlim(0, counts.max() * 1.15)
    _save(fig, "fig1_class_distribution.png")


def fig_feature_selection(mi_ranking: pd.Series) -> None:
    top = mi_ranking.head(25).iloc[::-1]
    selected = set(mi_ranking.head(config.TOP_K_FEATURES).index)
    fig, ax = plt.subplots(figsize=(7, 6))
    colors = [C["rf"] if f in selected else C["grid"] for f in top.index]
    ax.barh(top.index, top.values, color=colors, height=0.62)
    ax.set_xlabel("Mutual information with label")
    ax.set_title(
        f"Feature selection — top {config.TOP_K_FEATURES} of "
        f"{len(mi_ranking)} encoded features kept (gray = dropped)",
        loc="left", fontsize=11, color=C["ink"])
    ax.grid(axis="y", visible=False)
    ax.tick_params(labelsize=8)
    _save(fig, "fig2_feature_selection.png")


def fig_confusion_matrices(results: dict) -> None:
    from matplotlib.colors import LinearSegmentedColormap
    cmap = LinearSegmentedColormap.from_list("blues", ["#ffffff"] + C["seq"])
    fig, axes = plt.subplots(1, 3, figsize=(10.5, 3.4))
    for ax, (name, res) in zip(axes, results.items()):
        m = res["metrics"]
        cm = np.array([[m["tn"], m["fp"]], [m["fn"], m["tp"]]])
        norm = cm / cm.sum(axis=1, keepdims=True)
        ax.imshow(norm, cmap=cmap, vmin=0, vmax=1)
        for i in range(2):
            for j in range(2):
                ax.text(j, i, f"{cm[i, j]:,}\n({norm[i, j]:.1%})",
                        ha="center", va="center", fontsize=9,
                        color="#ffffff" if norm[i, j] > 0.55 else C["ink"])
        ax.set_xticks([0, 1], ["Benign", "Attack"])
        ax.set_yticks([0, 1], ["Benign", "Attack"])
        ax.set_xlabel("Predicted")
        ax.set_ylabel("Actual" if name == "rf" else "")
        ax.set_title(config.MODEL_LABELS[name], fontsize=10, color=C["ink"])
        ax.grid(visible=False)
    fig.suptitle("Confusion matrices — UNSW-NB15 test set", x=0.01, ha="left",
                 fontsize=11, color=C["ink"])
    fig.tight_layout(rect=[0, 0, 1, 0.94])
    _save(fig, "fig3_confusion_matrices.png")


def fig_roc_pr_curves(results: dict, y_test) -> None:
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10.5, 4))
    for name, res in results.items():
        color = C[name]
        fpr, tpr, _ = roc_curve(y_test, res["scores"])
        ax1.plot(fpr, tpr, color=color, linewidth=2,
                 label=f'{config.MODEL_LABELS[name]} (AUC {res["metrics"]["roc_auc"]:.3f})')
        prec, rec, _ = precision_recall_curve(y_test, res["scores"])
        ax2.plot(rec, prec, color=color, linewidth=2,
                 label=f'{config.MODEL_LABELS[name]} (AP {res["metrics"]["pr_auc"]:.3f})')
    ax1.plot([0, 1], [0, 1], color=C["muted"], linewidth=1, linestyle="--")
    ax1.set_xlabel("False positive rate"); ax1.set_ylabel("True positive rate")
    ax1.set_title("ROC curves", loc="left", fontsize=11, color=C["ink"])
    ax1.legend(loc="lower right", fontsize=8.5, frameon=False)
    ax2.set_xlabel("Recall"); ax2.set_ylabel("Precision")
    ax2.set_title("Precision–recall curves", loc="left", fontsize=11, color=C["ink"])
    ax2.set_ylim(0.9, 1.005)
    ax2.legend(loc="lower left", fontsize=8.5, frameon=False)
    fig.tight_layout()
    _save(fig, "fig4_roc_pr_curves.png")


def fig_model_comparison(results: dict) -> None:
    metrics = ["accuracy", "precision", "recall", "f1", "roc_auc"]
    labels = ["Accuracy", "Precision", "Recall", "F1", "ROC-AUC"]
    x = np.arange(len(metrics))
    width = 0.26
    fig, ax = plt.subplots(figsize=(8.5, 4))
    for i, (name, res) in enumerate(results.items()):
        vals = [res["metrics"][m] for m in metrics]
        bars = ax.bar(x + (i - 1) * width, vals, width * 0.94, color=C[name],
                      label=config.MODEL_LABELS[name])
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v + 0.008, f"{v:.3f}",
                    ha="center", fontsize=7.5, color=C["ink2"])
    ax.set_xticks(x, labels)
    ax.set_ylim(0.8, 1.02)
    ax.set_title("Model comparison — UNSW-NB15 test set", loc="left",
                 fontsize=11, color=C["ink"])
    ax.grid(axis="x", visible=False)
    ax.legend(fontsize=9, frameon=False, loc="lower right")
    _save(fig, "fig5_model_comparison.png")


def fig_per_family(results: dict) -> None:
    families = list(next(iter(results.values()))["per_family"].keys())
    families = [f for f in families if f != "Normal"] + ["Normal"]
    y = np.arange(len(families))
    height = 0.26
    fig, ax = plt.subplots(figsize=(8, 6.5))
    for i, (name, res) in enumerate(results.items()):
        vals = [res["per_family"][f] for f in families]
        ax.barh(y + (1 - i) * height, vals, height * 0.94, color=C[name],
                label=config.MODEL_LABELS[name])
    ax.set_yticks(y, [f + (" (specificity)" if f == "Normal" else "") for f in families])
    ax.invert_yaxis()
    ax.set_xlabel("Detection rate (recall per attack family)")
    ax.set_xlim(0, 1.05)
    ax.set_title("Per-attack-family detection — UNSW-NB15 test set", loc="left",
                 fontsize=11, color=C["ink"])
    ax.grid(axis="y", visible=False)
    ax.legend(fontsize=9, frameon=False, loc="lower right")
    _save(fig, "fig6_per_family_recall.png")


def fig_edge_feasibility(results: dict) -> None:
    names = list(results.keys())
    sizes = [results[n]["efficiency"]["model_size_kb"] for n in names]
    lat = [results[n]["efficiency"]["latency_us_per_sample"] for n in names]
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(9, 3.6))
    for ax, vals, title, unit in (
        (ax1, sizes, "Serialized model size", "KB"),
        (ax2, lat, "Inference latency per sample", "µs"),
    ):
        bars = ax.bar([config.MODEL_LABELS[n] for n in names], vals,
                      color=[C[n] for n in names], width=0.55)
        for b, v in zip(bars, vals):
            ax.text(b.get_x() + b.get_width() / 2, v, f" {v:,.0f} {unit}",
                    ha="center", va="bottom", fontsize=8.5, color=C["ink2"])
        ax.set_title(title, loc="left", fontsize=11, color=C["ink"])
        ax.set_yscale("log")
        ax.grid(axis="x", visible=False)
        ax.tick_params(labelsize=9)
    fig.suptitle("Edge-deployment feasibility (log scale)", x=0.01, ha="left",
                 fontsize=11, color=C["ink"])
    fig.tight_layout(rect=[0, 0, 1, 0.92])
    _save(fig, "fig8_edge_feasibility.png")
