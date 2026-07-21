# UNSW-NB15 Benchmark Pipeline

Supervised machine-learning benchmark for the AI-driven IDPS project
(SEC 3044 Assignment 2). This pipeline implements the methodology proposed in
Assignment 1: preprocess a public labeled intrusion-detection dataset, train and
compare **Random Forest, SVM and XGBoost**, evaluate with cybersecurity-relevant
metrics, measure IoT/edge deployment feasibility, and explain the models with
feature importance and SHAP.

## Quick start

```bash
cd ml
pip install -r requirements.txt
python download_data.py        # fetches UNSW_NB15.csv (~32 MB) into ml/data/
python run_pipeline.py         # full run (~5–10 min)
python make_dataset_figures.py # dataset-explanation figures (fig10–fig14)
python export_replay.py        # trained-model verdicts on real test flows → dashboard
# python run_pipeline.py --fast  # quick smoke test (~2 min)
```

## What it does

| Stage | Assignment 1 step | Details |
|---|---|---|
| Clean | Step 1 | drop `id`, deduplicate rows, impute non-finite values |
| Encode + normalize | Step 2 | one-hot `proto`/`service`/`state` (rare categories folded), `StandardScaler` on numerics — fit on the training split only |
| Split | Step 3 | stratified 70/30 split on `attack_cat` so rare families appear in both splits |
| Balance | Step 2 | cost-sensitive learning: `class_weight='balanced'` (RF/SVM), `scale_pos_weight` (XGBoost) |
| Feature selection | Step 2 | mutual information → top 20 of ~60 encoded features |
| Train | Step 4 | RF (200 trees), RBF-SVM (20k-row stratified subsample — kernel SVM is quadratic in n), XGBoost (300 rounds, hist) |
| Evaluate | Step 5 | accuracy, precision, recall, F1, FPR, ROC-AUC, PR-AUC, confusion matrices, per-attack-family recall, 5-fold CV (RF/XGB), model size + inference latency |
| Explain | Step 6 | impurity importances (RF/XGB) + SHAP beeswarm (XGBoost) |

## Outputs

- `results/metrics.json` — every number used in the report
- `results/metrics_summary.csv` — model × metric table
- `results/figures/fig1…fig9.png` — result figures (run_pipeline.py)
- `results/figures/fig10…fig14.png` — dataset/preprocessing figures
  (make_dataset_figures.py): step-by-step pipeline flow, split composition,
  benign-vs-attack feature distributions, service composition, feature
  correlation
- `../data/benchmark-results.json` — trimmed copy rendered by the dashboard's
  **Offline Benchmark** panel (`components/idps/benchmark-panel.tsx`)
- `../data/unsw-replay.json` — the trained XGBoost model's verdicts on ~1,500
  real held-out test flows (`export_replay.py`), streamed by the dashboard's
  **UNSW-NB15 Replay** panel (`components/idps/unsw-replay-panel.tsx`); metrics
  recompute live and converge to the benchmark

## Dataset

UNSW-NB15 (Moustafa & Slay, MilCIS 2015) — official 175,341-record partition
CSV, 45 columns, 9 attack families + Normal. Canonical source:
<https://research.unsw.edu.au/projects/unsw-nb15-dataset>. `download_data.py`
fetches a public GitHub mirror of the same partition. The multiclass
`attack_cat` column is **never shown to the models**; it is used only for the
per-family results breakdown.
