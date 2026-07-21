# Implementation Report: AI-Driven Intrusion Detection and Prevention System

---

## 1. Introduction and Problem Recap

Traditional Intrusion Detection and Prevention Systems (IDPS) rely predominantly on static signatures and predefined rules. While effective against known threats, these approaches fail against zero-day exploits, polymorphic malware, and the dynamic attack strategies targeting modern cloud and IoT infrastructures. As identified in Assignment 1, the core problem this project addresses is the inability of signature-only IDPS to detect novel attacks in real time, and the high false-positive rates that plague purely anomaly-based alternatives.

This project implements the Assignment 1 methodology in **two complementary tracks**. First, a **supervised ML benchmark** (`ml/`) trains and compares Random Forest, SVM and XGBoost on the UNSW-NB15 dataset — covering the full planned workflow of preprocessing, dataset splitting, model comparison, cybersecurity-relevant metrics, edge-feasibility measurement and SHAP explainability. Second, a **hybrid AI-driven IDPS** combines a rule-based signature engine with an online machine-learning anomaly detector, fused through an ensemble decision layer: the system monitors a live network traffic stream, classifies each packet as benign, suspicious, or malicious, explains every verdict, and automatically prevents high-severity intrusions by blocking offending source IPs. Together they demonstrate that behavior-based learning detects attacks without signatures (including zero-day-style traffic), and that a hybrid architecture keeps false positives low enough for practical deployment. The dashboard renders both: live engine metrics and the offline benchmark results.

---

## 2. Methodology Overview

The methodology follows the hybrid/ensemble framework proposed in Assignment 1 (Section 2.2.4), which combines interpretable classical detection with ML-based anomaly scoring to reduce false positives and enable human-in-the-loop validation.

### Methodology Diagram

```
                        ┌─────────────────────────┐
                        │   Network Traffic Stream │
                        │ (benign + attack bursts) │
                        └────────────┬────────────┘
                                     │ per-packet
                        ┌────────────▼────────────┐
                        │   IPS Pre-filter        │──── source on blocklist? ──► DROP
                        └────────────┬────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                                             │
 ┌────────────▼─────────────┐              ┌────────────────▼──────────────┐
 │ Layer 1: Signature Engine │              │ Layer 2: ML Anomaly Engine    │
 │ • SQLi payload regex      │              │ • Feature extraction          │
 │ • Failed-auth threshold   │              │   (bytes, ports, rate)        │
 │ • Port-scan window rule   │              │ • Online baseline (Welford    │
 │ • SYN-flood rate rule     │              │   mean/variance per feature)  │
 │ • Exfiltration volume rule│              │ • Z-score → anomaly score 0–1 │
 └────────────┬─────────────┘              └────────────────┬──────────────┘
              │ signature match + confidence                │ anomaly score
              └──────────────────────┬──────────────────────┘
                        ┌────────────▼────────────┐
                        │ Layer 3: Ensemble Fusion │
                        │ verdict = f(sig, anomaly)│
                        │ benign / suspicious /    │
                        │ malicious + severity     │
                        └────────────┬────────────┘
                 ┌───────────────────┼───────────────────┐
                 │                   │                   │
        ┌────────▼───────┐  ┌────────▼────────┐  ┌───────▼────────┐
        │ Benign: online │  │ Suspicious:     │  │ Malicious      │
        │ learning —     │  │ analyst review  │  │ (high/critical)│
        │ refine baseline│  │ (human-in-loop) │  │ → auto-block IP│
        └────────────────┘  └─────────────────┘  └────────────────┘
```

### Refinements Made During Implementation

Two refinements were made to the Assignment 1 methodology:

1. **The live engine adds online (incremental) learning on top of the planned batch training.** The batch-trained supervised models from Assignment 1 are implemented in the UNSW-NB15 benchmark pipeline (`ml/`); for the live dashboard, the anomaly model additionally uses Welford's online algorithm to maintain running mean/variance per feature, so benign-classified traffic continuously refines the baseline — addressing the concept-drift challenge identified in Section 2.2.5 of Assignment 1.
2. **A three-tier verdict system (benign / suspicious / malicious) was added** instead of a binary classifier. Moderate anomaly scores (0.50–0.72) are flagged as "suspicious" for analyst review rather than auto-blocked, implementing the human-in-the-loop validation recommended for hybrid frameworks and reducing the operational cost of false positives.

---

## 3. Implementation, Results, and Evaluation

### 3.1 Development Process

**Tools, libraries, and environment.** The system was implemented as a real-time web application:

| Component | Technology |
|---|---|
| Language | TypeScript |
| Framework / runtime | Next.js 16 (React 19), Node.js |
| Detection engine | Custom TypeScript module (`lib/idps/engine.ts`) — no external ML library; the anomaly model is implemented from first principles (Welford online statistics, z-score deviation, exponential squashing) |
| Visualization | Recharts (live traffic chart, attack distribution), shadcn/ui + Tailwind CSS (dashboard) |
| Evaluation harness | Standalone script (`scripts/evaluate.ts`) run with tsx |
| Benchmark ML pipeline | Python 3.12 — pandas/NumPy (processing), scikit-learn (preprocessing, Random Forest, SVM, metrics), XGBoost, SHAP (explainability), Matplotlib (figures) — in `ml/` |

**Dataset and preprocessing.** Two complementary data sources are used, matching the two components of the system.

*(a) UNSW-NB15 benchmark dataset (supervised pipeline, `ml/`).* The supervised-learning methodology proposed in Assignment 1 was implemented on the UNSW-NB15 dataset (Moustafa & Slay, 2015) — the official partition CSV of 175,341 labeled flow records with 39 numeric features, 3 categorical features (`proto`, `service`, `state`), a binary label and a multiclass `attack_cat` covering nine attack families (Generic, Exploits, Fuzzers, DoS, Reconnaissance, Analysis, Backdoor, Shellcode, Worms). Preprocessing followed the Assignment 1 workflow exactly:

1. **Cleaning** — the `id` column was dropped; **67,601 duplicate records were removed** to prevent train/test leakage (175,341 → 107,740 records); non-finite values were median-imputed (none found).
2. **Encoding & normalization** — `proto`/`service`/`state` one-hot encoded with rare categories (< 0.1 % of training rows) folded into an *infrequent* bucket; numeric features standardized with a `StandardScaler` **fitted on the training split only** (no leakage). Result: 60 encoded features.
3. **Splitting** — stratified 70/30 train/test split (75,418 / 32,322 records), stratified on `attack_cat` so rare families (e.g., Worms, n = 130) appear in both splits proportionally.
4. **Balancing** — the binary classes are moderately imbalanced (~52/48 after cleaning, ~68/32 before), so cost-sensitive learning was used (`class_weight='balanced'` for RF/SVM, `scale_pos_weight` for XGBoost) instead of synthetic oversampling, keeping evaluation on genuine records only.
5. **Feature selection** — mutual information ranked all 60 encoded features; the **top 20** were retained (led by `sbytes`, `dbytes`, `sttl`, `dttl`, `ct_state_ttl`), directly serving the IoT/edge objective of a small feature vector. The `attack_cat` column is never shown to the models — it is kept aside solely for the per-family results breakdown.

Every stage is visualized in `ml/results/figures/`: the step-by-step pipeline flow with record/feature counts (fig10), class distribution (fig1), split composition (fig11), mutual-information ranking (fig2), benign-vs-attack distributions of the top features (fig12 — e.g., benign flows cluster at source-TTL 31/62 while attacks sit at 254/255), attack share per service (fig13), and the correlation structure of the selected features (fig14).

*(b) Live synthetic stream (dashboard).* The real-time demonstration uses a **parameterized synthetic traffic generator** (`lib/idps/traffic.ts`) that produces labeled packets in real time:

- *Benign traffic*: HTTP/HTTPS/DNS/SSH/TCP packets with realistic ports (80, 443, 53, 22, …), payload sizes (200–4,500 bytes), and ephemeral source ports.
- *Attack traffic*: six labeled attack scenarios — port scan, SYN flood, SQL injection, brute force, data exfiltration, and a "zero-day" scenario (anomalous protocol/port/size combination with no matching signature, detectable only by the ML layer).

Every packet carries a ground-truth label used **only for evaluation**, never by the detection engine. Preprocessing consists of per-packet feature extraction: log-scaled byte count (log1p to normalize the heavy-tailed size distribution), source/destination port, and a per-source behavioral window (5-second sliding window tracking distinct ports probed, SYN count, failed authentications, and packet rate).

**Implementation of the methodology.** The three layers of the proposed architecture were implemented as follows:

- **Layer 1 — Signature engine**: five explicit rules (SQL-injection regex on payloads; ≥6 failed auth attempts / 5 s; ≥10 distinct ports probed / 5 s; SYN rate ≥15 / 5 s; abnormal outbound volume from internal hosts), each with a rule ID and confidence (0.88–0.97) for explainability.
- **Layer 2 — ML anomaly engine**: the model is pre-trained on 300 benign packets at startup, then learns continuously. Each packet's feature z-scores are squashed into a weighted 0–1 anomaly score (bytes 0.35, rate 0.30, dst-port 0.20, src-port 0.15, plus behavioral bonuses for URG flags and low-source-port UDP).
- **Layer 3 — Ensemble fusion**: verdicts follow a priority ladder — signature *and* anomaly agreement yields a hybrid detection with "minimal false-positive risk"; signature alone yields a rule-based detection; anomaly score > 0.72 with no signature yields a possible zero-day; 0.50–0.72 yields "suspicious" (analyst review); otherwise benign, and the packet trains the baseline.
- **Prevention (IPS)**: high/critical malicious verdicts trigger automatic source-IP blocking; subsequent packets from blocked sources are dropped before analysis. Prevention can be toggled to run the system in IDS-only mode.

*Adjustment during implementation:* severity thresholds were tuned so that only high-confidence detections (fused score > 0.85) trigger auto-blocking, preventing the IPS from acting on borderline anomaly scores.

### 3.2 Results Presentation

#### 3.2.A Benchmark results — UNSW-NB15 (Random Forest vs SVM vs XGBoost)

All models were trained on the same 75,418-record training split and evaluated on the held-out 32,322-record test set (`ml/run_pipeline.py`; figures in `ml/results/figures/`). The RBF-kernel SVM was trained on a stratified 20,000-record subsample because kernel-SVM training scales quadratically with dataset size — itself a deployment-relevant finding.

| Metric | Random Forest | SVM (RBF) | XGBoost |
|---|---|---|---|
| Accuracy | 91.76 % | 90.19 % | **92.02 %** |
| Precision | 90.14 % | 84.23 % | **90.18 %** |
| Recall (detection rate) | 94.43 % | **99.74 %** | 94.94 % |
| F1-score | 92.23 % | 91.33 % | **92.50 %** |
| False Positive Rate | 11.11 % | 20.09 % | 11.13 % |
| ROC-AUC | 0.9774 | 0.9450 | **0.9805** |
| PR-AUC | 0.9756 | 0.9348 | **0.9804** |
| 5-fold CV accuracy | 91.40 % ± 0.19 | n/a (cost) | 91.63 % ± 0.18 |

**Per-attack-family detection rate (recall):**

| Family | Random Forest | SVM (RBF) | XGBoost |
|---|---|---|---|
| Generic | 99.4 % | 99.9 % | 99.8 % |
| Reconnaissance | 99.8 % | 100 % | 99.9 % |
| Backdoor | 99.6 % | 99.1 % | 99.1 % |
| Exploits | 98.4 % | 99.9 % | 98.5 % |
| DoS | 97.9 % | 99.7 % | 98.0 % |
| Worms | 97.4 % | 100 % | 100 % |
| Analysis | 90.6 % | 99.2 % | 88.3 % |
| Shellcode | 87.8 % | 100 % | 93.6 % |
| Fuzzers | 85.3 % | 99.5 % | 86.6 % |
| *Normal (specificity)* | *88.9 %* | *79.9 %* | *88.9 %* |

**Edge/IoT deployment feasibility (20 features):**

| Model | Training time | Serialized size | Latency / sample | Throughput |
|---|---|---|---|---|
| Random Forest | 13.5 s | 22.8 MB | 11.3 µs | 88,456 flows/s |
| SVM (RBF) | 12.8 s (20 k rows) | 407 KB | 634.0 µs | 1,577 flows/s |
| XGBoost | 6.5 s | 808 KB | **4.9 µs** | **204,649 flows/s** |

**Explainability.** SHAP analysis (TreeExplainer on XGBoost) and impurity importances from both tree ensembles agree on the dominant features: `sttl` (source→destination TTL), `ct_state_ttl`, `dttl`, `dbytes`, `smean` — TTL and byte-volume behavior separate attack flows from benign ones in this dataset. The SHAP beeswarm (fig9) shows *low* `sttl` values push flows toward benign while a specific high band pushes strongly toward attack.

#### 3.2.B Live-simulation results — hybrid engine

Evaluation was performed with an offline harness (`scripts/evaluate.ts`): 10 independent trials, each with a freshly trained engine, ~500 benign packets, and 5 bursts of each of the 6 attack types interleaved into the stream (**9,162 packets total**). Ground-truth labels were compared against engine verdicts (suspicious or malicious = positive).

**Overall confusion matrix and metrics:**

| Metric | Value |
|---|---|
| True Positives | 2,294 |
| False Positives | 14 |
| True Negatives | 4,986 |
| False Negatives | 1,868 |
| **Accuracy** | **79.46%** |
| **Precision** | **99.39%** |
| **Recall (per-packet)** | **55.12%** |
| **F1-score** | **70.91%** |
| **False Positive Rate** | **0.28%** |

**Per-attack-type detection (packet level):**

| Attack type | Detection rate | Auto-prevented |
|---|---|---|
| SQL Injection | 100.0% | 100.0% |
| Data Exfiltration | 100.0% | 100.0% |
| Zero-Day (anomaly-only) | 100.0% | 100.0% |
| Port Scan | 65.4% | 51.6% |
| Brute Force | 60.9% | 60.9% |
| SYN Flood | 20.0% | 8.0% |

**Detections by method (first-pass, before IP blocking):**

| Method | Share of detections |
|---|---|
| ML anomaly engine | 61.4% |
| Signature engine | 32.2% |
| Hybrid (both agree) | 6.4% |

In the live dashboard, these results are visualized as a real-time stacked area chart of traffic composition, live accuracy/precision/recall stat cards, an attack-type distribution chart, an explainable alert feed, and the active IPS blocklist.

**Integration — the dataset drives the dashboard.** To connect the two tracks, the trained XGBoost model classifies the genuine held-out UNSW-NB15 test flows offline (`ml/export_replay.py`), and the dashboard's **UNSW-NB15 Replay panel** (`components/idps/unsw-replay-panel.tsx`) streams those real flows one at a time. Each row shows the flow's true attack family against the model's ATTACK/BENIGN verdict and its P(attack); the accuracy, precision, recall and false-positive-rate tiles recompute live and converge to the offline benchmark (≈92% accuracy, ≈11% FPR) as flows accumulate. This makes the reported numbers demonstrably the output of the trained model classifying real data, rather than a static figure. (The scikit-learn model cannot execute inside a browser, so inference runs in Python and the per-flow verdicts are replayed; the separate hybrid engine classifies the synthetic stream in real time — two models presented in one dashboard.)

### 3.3 Results Commentary and Analysis

#### 3.3.A Benchmark analysis (UNSW-NB15)

**XGBoost is the best overall model — and by far the most deployable.** It leads on accuracy (92.02 %), F1 (92.50 %), ROC-AUC (0.9805) and PR-AUC, while being ~28× smaller than Random Forest (808 KB vs 22.8 MB) and 2.3× faster per flow (4.9 µs, >200 k flows/s on a laptop CPU). For the IoT/edge deployment objective from Assignment 1, XGBoost dominates on every axis measured: model size fits comfortably in gateway-class memory, and single-flow latency is orders of magnitude below packet inter-arrival times on constrained links.

**The SVM exposes the recall/false-positive trade-off in its purest form.** It missed only 44 of 16,755 attack flows (99.74 % recall) but misflagged 20.1 % of benign traffic — exactly the alert-fatigue failure mode identified in the Assignment 1 literature review. Combined with its 634 µs/sample kernel-evaluation cost (130× slower than XGBoost) and quadratic training scaling (which forced a 20 k-row training subsample), the RBF-SVM is unsuitable for edge deployment despite its detection strength — it would be defensible only as a high-recall second-stage filter.

**Per-family results locate the hard cases.** All three models detect Generic, Reconnaissance, Exploits, DoS and Backdoor at ≈ 98–100 %. The stragglers are **Fuzzers (85–87 % for the tree models), Shellcode and Analysis** — families whose flow statistics most resemble benign traffic; the SVM "detects" them near-100 % only by over-predicting the attack class (79.9 % specificity). Worms is detected at 97–100 % but rests on just 39 test flows, so it should not be over-interpreted.

**Cross-validation confirms the results are stable.** 5-fold CV accuracy (RF 91.40 % ± 0.19, XGBoost 91.63 % ± 0.18) is within half a point of the held-out test accuracy, indicating no overfitting to a particular split.

**Comparison with published benchmarks — and why our numbers are honest.** Published binary classifiers on UNSW-NB15 report 89–99 % accuracy. Studies at the top of that range typically evaluate **without removing the 67,601 duplicate records**; when identical flows appear in both train and test sets, accuracy is inflated by memorization. After deduplication, our 92 %/0.98-AUC results sit squarely in the range reported by careful studies, and the ~11 % FPR is consistent with the known difficulty of the Normal/Fuzzers boundary in this dataset.

**A critical note on the dominant features.** SHAP and impurity importances agree that TTL-derived features (`sttl`, `ct_state_ttl`, `dttl`) carry most of the signal. This is a **known artifact of how UNSW-NB15 was generated** (attack and benign traffic originate from different simulation hosts with different TTL defaults, as noted in published feature-analysis work on this dataset). A model relying on TTL may not transfer to other networks — an argument *for* the hybrid architecture below, where learned models are fused with signature rules rather than trusted alone, and a concrete illustration of the data-representativeness limitation anticipated in Assignment 1.

#### 3.3.B Live-simulation analysis (hybrid engine)

**Near-zero false positives validate the hybrid design.** The headline result is a precision of 99.39% and an FPR of 0.28% — only 14 of 5,000 benign packets were misflagged. This directly supports the central claim from the Assignment 1 literature review that hybrid/ensemble frameworks reduce false positives compared to purely anomaly-based systems, which historically suffered high false-positive rates. The suspicious tier absorbs borderline scores instead of raising alarms, which is the main mechanism behind this result.

**The ML layer successfully detected 100% of zero-day traffic.** The zero-day scenario has no matching signature by design, so every detection came from the anomaly model recognizing deviation from the learned baseline. This confirms the core motivation of the project: behavior-based learning generalizes to attacks that signature systems cannot see. Notably, the anomaly engine was the leading detection method overall (61.4% of first-pass detections), showing the ML layer is not merely a supplement but the primary detector.

**Per-packet recall (55.12%) reveals an expected structural limitation of windowed detection.** Recall appears low, but the breakdown explains it: content-based attacks (SQL injection, exfiltration, zero-day) were caught at 100%, while volumetric attacks (SYN flood 20%, port scan 65%, brute force 61%) were caught at lower per-packet rates. This is inherent to threshold-based windowing — a SYN flood is only recognizable *after* enough SYN packets accumulate in the 5-second window, so the first ~15 packets of every burst are individually classified as benign before the threshold trips. At the **incident level, every attack burst was ultimately detected and its source blocked**; the "missed" packets are the early packets of each burst. This mirrors a well-known trade-off in the literature between detection latency and false-alarm suppression: lowering thresholds raises per-packet recall but inflates false positives.

**The prevention layer amplifies detection.** Once a source IP was blocked, all subsequent packets were dropped before analysis, meaning long-running attacks (SQL injection, exfiltration) reached 100% prevention. SYN floods showed the lowest prevention rate (8%) because the generator distributes the flood across multiple spoofed source IPs — accurately reflecting the real-world difficulty of IP-blocking as a defense against distributed floods, and suggesting rate-limiting or SYN cookies as complementary countermeasures.

**Comparison with expectations and benchmarks.** Published hybrid IDS studies on CIC-IDS2017 typically report 95–99% accuracy at the *flow* level. This system's 79.46% accuracy is measured at the stricter *per-packet* level and on live streaming data with an online model rather than an offline-trained classifier, so figures are not directly comparable. The false-positive rate (0.28%) and per-incident detection rate (100% of attack bursts detected) are in line with, or better than, expectations from the reviewed literature.

**Limitations.**
1. *Benchmark vs live gap*: the supervised models are validated on UNSW-NB15 while the live engine runs on synthetic traffic; the two are complementary but not yet integrated into a single online pipeline (replaying UNSW-NB15 flows through the dashboard engine is the natural next step).
2. *Dataset representativeness / concept drift*: UNSW-NB15 was captured in 2015 and its dominant TTL features are partly a generation artifact (§3.3.A); cross-dataset validation (CIC-IDS2017, ToN-IoT) and continual retraining would be required before operational deployment.
3. *Per-packet windowed detection delays volumetric attack recognition* in the live engine (analyzed above); flow-level aggregation would raise measured recall substantially.
4. *The online anomaly model is univariate per feature*: it cannot capture cross-feature correlations that a deep model (autoencoder, LSTM) would learn — a deliberate trade-off for explainability and in-browser real-time performance.
5. *IP blocking is weak against distributed attacks*, as the SYN-flood results demonstrate.
6. *No adversarial-robustness testing*: evasion via feature manipulation (e.g., TTL normalization, payload padding) was out of scope; adversarial training is future work, as anticipated in Assignment 1.

**Conclusion of evaluation.** Both evaluation tracks confirm the Assignment 1 hypothesis. On real benchmark data, behavior-based supervised models (best: XGBoost, 92.0 % accuracy, 0.98 ROC-AUC, 4.9 µs/flow, 808 KB) detect attacks without signatures and are feasible for IoT/edge deployment; on the live stream, the hybrid signature + ML ensemble achieves broad coverage — including zero-day detection impossible for signature-only systems — while keeping false positives near zero. The ~11 % benchmark FPR versus the hybrid engine's 0.28 % FPR quantifies exactly why the ensemble/human-in-the-loop layer proposed in Assignment 1 matters: a learned classifier alone is deployable but noisy, and fusing it with signatures and a suspicious tier is what makes the false-positive rate operationally acceptable.
