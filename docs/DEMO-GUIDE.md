# Live Demonstration Guide (SEC 3044 Assignment 2)

Target: 6–8 minutes covering everything the brief asks for — working prototype,
main workflow steps, how results are generated and interpreted, and interesting
findings. No slides needed; the dashboard and the terminal are the demo.

## Before class (backup plan included)

1. `npm run dev` in the repo root → check http://localhost:3000 loads.
2. `cd ml` and confirm `python run_pipeline.py --fast` works (~2 min) — this is
   your "prove it runs live" fallback.
3. Keep `ml/results/figures/` open in Explorer — if anything breaks, the full
   set of pre-generated figures and `results/metrics.json` are your backup demo.

## Suggested flow

**1. Problem recap (30 s).** Signature-only IDPS misses zero-days; anomaly-only
floods analysts with false positives. Assignment 1 proposed: supervised ML on a
benchmark dataset + a hybrid signature/ML/ensemble architecture. Both were built.

**2. Dataset & preprocessing (1.5 min) — terminal.** Run:
`cd ml && python run_pipeline.py --fast` and narrate the printed pipeline while
it runs, in this order (it mirrors Figures 3.2 in the report):

- 175,341 UNSW-NB15 records → **Step 1 clean**: drop `id`, remove **67,601
  duplicates** (prevents memorization inflating accuracy) → 107,740 records.
- **Step 2 encode**: one-hot `proto`/`service`/`state` → 60 features.
- **Step 3 normalize**: StandardScaler fitted on train only (no leakage).
- **Step 4 split**: stratified 70/30 on `attack_cat` so rare families (Worms,
  n=130) exist in both splits.
- **Step 5 balance**: class weights, not SMOTE — every record stays genuine.
- **Step 6 select**: mutual information keeps the top 20 of 60 features.

**3. Benchmark results (2 min) — figures.** Open `fig5_model_comparison.png`,
`fig3_confusion_matrices.png`, `fig8_edge_feasibility.png`:

- XGBoost wins: **92.0 % accuracy, F1 92.5 %, ROC-AUC 0.98** — and it's 808 KB
  at 4.9 µs/flow (edge-deployable). Random Forest is close but 22.8 MB.
- SVM: 99.7 % recall but **20 % false-positive rate** and 634 µs/flow — the
  alert-fatigue model. Great recall, undeployable.
- Show `fig12_feature_distributions.png`: benign TTL clusters at 31/62, attacks
  at 254/255 — then `fig9_shap_summary.png`: SHAP confirms `sttl` dominates.
  **Interesting finding**: that's partly a dataset artifact (different simulation
  hosts), which is exactly why we don't trust the ML model alone → hybrid.

**4. Live hybrid system (2.5 min) — dashboard.** http://localhost:3000:

- Point out the **Offline Benchmark panel** — the Python results rendered live.
- Launch **Port Scan** → watch alerts fire (signature rule: distinct-ports
  window), source IP gets auto-blocked (IPS).
- Launch **Zero-Day** → no signature exists; the anomaly engine catches it from
  baseline deviation. This is the headline: *behavior beats signatures*.
- Show the metric cards: precision ~99 %, FPR ~0.3 % — versus the benchmark's
  11 % FPR. **The ensemble + suspicious tier is what makes ML operational.**
- Toggle Prevention off → alerts continue but no blocking (IDS vs IPS mode).

**5. Close (30 s).** Both tracks confirm Assignment 1's hypothesis; limitations
(TTL artifact, 2015 dataset, no adversarial testing) and future work (replay
benchmark flows through the live engine, continual learning).

## Likely questions & answers

- **Why is your accuracy 92 % when papers report 99 %?** They usually keep the
  67,601 duplicates; identical flows in train and test inflate accuracy via
  memorization. Ours is deduplicated — honest generalization performance.
- **Why is SVM trained on only 20,000 rows?** RBF-kernel training is O(n²)–O(n³);
  full-set training is impractical — and that itself is an edge-feasibility
  finding reported in the paper.
- **Why class weights instead of SMOTE?** Binary imbalance is mild (48/52);
  synthetic minority samples add fabricated flows without clear benefit, and
  rare-family coverage is already ensured by stratifying on `attack_cat`.
- **Where does the engine's anomaly score come from?** Welford online
  mean/variance per feature → z-scores → weighted squash to 0–1
  (`lib/idps/engine.ts`); scores > 0.72 are malicious, 0.50–0.72 suspicious.
- **How does the ensemble decide?** Priority ladder: signature+anomaly agree →
  hybrid (highest confidence); signature only; anomaly only (possible zero-day);
  suspicious tier for borderline; else benign and the packet trains the baseline.
- **Model files?** `ml/results/models/*.joblib`; metrics in
  `ml/results/metrics.json`; every figure regenerates via
  `python run_pipeline.py` + `python make_dataset_figures.py`.
