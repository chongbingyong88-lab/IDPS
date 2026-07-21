# AI-Driven Intrusion Detection & Prevention System (IDPS)

SEC 3044 — Advanced Topics in Computer Security, Assignment 2.
Practical implementation of the methodology proposed in Assignment 1:
an AI/ML-based intrusion detection and prevention system evaluated on both a
**real benchmark dataset (UNSW-NB15)** and a **live traffic simulation**.

The project has two complementary components:

| Component | Where | What it demonstrates |
|---|---|---|
| **Offline ML benchmark** | [`ml/`](ml/) (Python) | Assignment 1 supervised-learning methodology: UNSW-NB15 preprocessing (clean → encode → normalize → balance → feature-select), Random Forest vs SVM vs XGBoost comparison, full metric suite (accuracy, precision, recall, F1, FPR, ROC-AUC, PR-AUC), per-attack-family breakdown, edge-feasibility measurements (model size, inference latency) and explainability (feature importance + SHAP) |
| **Real-time hybrid IDPS dashboard** | Next.js app (this repo root) | Hybrid detection in action: signature rules + online statistical ML anomaly detection + ensemble fusion, with automatic IP blocking (prevention), live metrics, and an explainable alert feed |

The dashboard's **Offline Benchmark panel** renders the results produced by the
Python pipeline (`data/benchmark-results.json`), and the **UNSW-NB15 Replay
panel** streams the trained XGBoost model's verdicts on the real held-out test
flows (`data/unsw-replay.json`) with metrics recomputing live — so the dataset
itself drives the dashboard, and both components are visible in a single demo.

## Setup on a new computer (first time)

> **For the live demo you only need Node.js.** The benchmark results are already
> committed, so the dashboard shows them without running Python. Python is only
> needed if you want to *re-run* the ML pipeline.

1. **Install Node.js** (LTS) — <https://nodejs.org>. Required for the dashboard.
2. **Install Git** — <https://git-scm.com/download/win> (or download this repo as
   a ZIP from GitHub instead of cloning).
3. **Install Python 3.12** — <https://www.python.org/downloads> — *only if you
   will re-run the ML pipeline*. Tick **“Add Python to PATH”** during install.
4. **Get the code:**
   ```bash
   git clone https://github.com/chongbingyong88-lab/IDPS.git
   cd IDPS
   ```
5. **Install dashboard dependencies** (first time only):
   ```bash
   npm install
   ```

Then follow *Running the dashboard* below. To also re-run the benchmark, do the
one-time `pip install` in *Running the ML benchmark*.

## Running the dashboard

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use the attack simulator
buttons (port scan, SYN flood, SQL injection, brute force, exfiltration,
zero-day) to inject labeled attack bursts and watch detection/prevention live.

## Running the ML benchmark

```bash
cd ml
pip install -r requirements.txt   # add --user if it errors on permissions
python download_data.py     # UNSW-NB15 partition CSV (~32 MB) — dataset is not committed
python run_pipeline.py      # trains RF / SVM / XGBoost, writes results + figures
```

Outputs land in `ml/results/` (metrics JSON/CSV + report figures) and refresh
`data/benchmark-results.json` for the dashboard panel. See
[`ml/README.md`](ml/README.md) for details.

## Repository layout

```
app/, components/       Next.js dashboard (view layer only)
hooks/use-idps.ts       simulation orchestrator (traffic → engine → state)
lib/idps/engine.ts      hybrid detection engine (signatures + online anomaly ML)
lib/idps/traffic.ts     labeled synthetic traffic generator
scripts/evaluate.ts     offline evaluation harness for the hybrid engine
ml/                     UNSW-NB15 supervised ML benchmark (Python)
ml/export_replay.py     trained-model verdicts on real test flows → dashboard
data/benchmark-results.json   benchmark output consumed by the dashboard
data/unsw-replay.json         real test flows + model verdicts for the replay panel
REPORT.md               implementation report (markdown mirror)
```

## Documentation

- [REPORT.md](REPORT.md) — full implementation report (methodology, results,
  analysis, limitations)
- [ml/README.md](ml/README.md) — benchmark pipeline usage and design notes
- [docs/DEMO-GUIDE.md](docs/DEMO-GUIDE.md) — live-demonstration walkthrough
  (flow, talking points, backup plan, likely Q&A)
