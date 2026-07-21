"""Central configuration for the UNSW-NB15 benchmark pipeline.

All paths are resolved relative to the ml/ directory so the pipeline can be
run from anywhere with `python run_pipeline.py`.
"""

from pathlib import Path

ML_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = ML_DIR.parent

DATA_DIR = ML_DIR / "data"
DATASET_CSV = DATA_DIR / "UNSW_NB15.csv"

RESULTS_DIR = ML_DIR / "results"
FIGURES_DIR = RESULTS_DIR / "figures"
MODELS_DIR = RESULTS_DIR / "models"
METRICS_JSON = RESULTS_DIR / "metrics.json"
SUMMARY_CSV = RESULTS_DIR / "metrics_summary.csv"

# Trimmed copy of the headline results consumed by the Next.js dashboard
DASHBOARD_JSON = REPO_DIR / "data" / "benchmark-results.json"

SEED = 42
TEST_SIZE = 0.30           # stratified 70/30 split (Assignment 1, Step 3)
TOP_K_FEATURES = 20        # features kept after mutual-information selection
MI_SAMPLE = 30_000         # rows used to estimate mutual information (speed)
SVM_TRAIN_SAMPLES = 20_000 # RBF-SVM is O(n^2..n^3); train it on a stratified subsample
SHAP_SAMPLE = 2_000        # test rows used for the SHAP summary plot
CV_FOLDS = 5               # cross-validation folds (RF / XGBoost only)

# Categories rarer than this fraction of training rows are folded into an
# "infrequent" bucket before one-hot encoding (keeps the feature space small).
RARE_CATEGORY_MIN_FREQ = 0.001

# Dataviz palette (light mode) — shared across all report figures.
COLORS = {
    "surface": "#fcfcfb",
    "ink": "#0b0b0b",
    "ink2": "#52514e",
    "muted": "#898781",
    "grid": "#e1e0d9",
    "rf": "#2a78d6",    # blue   — Random Forest
    "svm": "#008300",   # green  — SVM
    "xgb": "#e87ba4",   # magenta— XGBoost
    "seq": ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
}

MODEL_LABELS = {"rf": "Random Forest", "svm": "SVM (RBF)", "xgb": "XGBoost"}
