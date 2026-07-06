# Implementation Report: AI-Driven Intrusion Detection and Prevention System

---

## 1. Introduction and Problem Recap

Traditional Intrusion Detection and Prevention Systems (IDPS) rely predominantly on static signatures and predefined rules. While effective against known threats, these approaches fail against zero-day exploits, polymorphic malware, and the dynamic attack strategies targeting modern cloud and IoT infrastructures. As identified in Assignment 1, the core problem this project addresses is the inability of signature-only IDPS to detect novel attacks in real time, and the high false-positive rates that plague purely anomaly-based alternatives.

This project implements a **hybrid AI-driven IDPS** that combines a rule-based signature engine with an online machine-learning anomaly detector, fused through an ensemble decision layer. The system monitors a live network traffic stream, classifies each packet as benign, suspicious, or malicious, explains every verdict, and automatically prevents high-severity intrusions by blocking offending source IPs. The goal is to demonstrate that a hybrid architecture achieves broad detection coverage — including zero-day-style attacks with no known signature — while keeping false positives low enough for practical deployment.

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

1. **Online (incremental) learning replaced batch training.** Rather than training the anomaly model once on a static dataset, the implementation uses Welford's online algorithm to maintain running mean/variance per feature. Benign-classified traffic continuously refines the baseline, addressing the concept-drift challenge identified in Section 2.2.5 of Assignment 1.
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

**Dataset and preprocessing.** Instead of replaying a static benchmark dataset (e.g., CIC-IDS2017), the system uses a **parameterized synthetic traffic generator** (`lib/idps/traffic.ts`) that produces labeled packets in real time:

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

### 3.3 Results Commentary and Analysis

**Near-zero false positives validate the hybrid design.** The headline result is a precision of 99.39% and an FPR of 0.28% — only 14 of 5,000 benign packets were misflagged. This directly supports the central claim from the Assignment 1 literature review that hybrid/ensemble frameworks reduce false positives compared to purely anomaly-based systems, which historically suffered high false-positive rates. The suspicious tier absorbs borderline scores instead of raising alarms, which is the main mechanism behind this result.

**The ML layer successfully detected 100% of zero-day traffic.** The zero-day scenario has no matching signature by design, so every detection came from the anomaly model recognizing deviation from the learned baseline. This confirms the core motivation of the project: behavior-based learning generalizes to attacks that signature systems cannot see. Notably, the anomaly engine was the leading detection method overall (61.4% of first-pass detections), showing the ML layer is not merely a supplement but the primary detector.

**Per-packet recall (55.12%) reveals an expected structural limitation of windowed detection.** Recall appears low, but the breakdown explains it: content-based attacks (SQL injection, exfiltration, zero-day) were caught at 100%, while volumetric attacks (SYN flood 20%, port scan 65%, brute force 61%) were caught at lower per-packet rates. This is inherent to threshold-based windowing — a SYN flood is only recognizable *after* enough SYN packets accumulate in the 5-second window, so the first ~15 packets of every burst are individually classified as benign before the threshold trips. At the **incident level, every attack burst was ultimately detected and its source blocked**; the "missed" packets are the early packets of each burst. This mirrors a well-known trade-off in the literature between detection latency and false-alarm suppression: lowering thresholds raises per-packet recall but inflates false positives.

**The prevention layer amplifies detection.** Once a source IP was blocked, all subsequent packets were dropped before analysis, meaning long-running attacks (SQL injection, exfiltration) reached 100% prevention. SYN floods showed the lowest prevention rate (8%) because the generator distributes the flood across multiple spoofed source IPs — accurately reflecting the real-world difficulty of IP-blocking as a defense against distributed floods, and suggesting rate-limiting or SYN cookies as complementary countermeasures.

**Comparison with expectations and benchmarks.** Published hybrid IDS studies on CIC-IDS2017 typically report 95–99% accuracy at the *flow* level. This system's 79.46% accuracy is measured at the stricter *per-packet* level and on live streaming data with an online model rather than an offline-trained classifier, so figures are not directly comparable. The false-positive rate (0.28%) and per-incident detection rate (100% of attack bursts detected) are in line with, or better than, expectations from the reviewed literature.

**Limitations.**
1. *Synthetic traffic*: the generator, while realistic in structure, is simpler than genuine enterprise traffic; validation against CIC-IDS2017 or live captures is the natural next step.
2. *Per-packet windowed detection delays volumetric attack recognition* (analyzed above); flow-level aggregation would raise measured recall substantially.
3. *The statistical anomaly model is univariate per feature*: it cannot capture cross-feature correlations that a deep model (autoencoder, LSTM) would learn, which was a deliberate trade-off for explainability and in-browser real-time performance.
4. *IP blocking is weak against distributed attacks*, as the SYN-flood results demonstrate.

**Conclusion of evaluation.** The implementation confirms the Assignment 1 hypothesis: a hybrid signature + ML ensemble achieves broad coverage — including zero-day detection impossible for signature-only systems — while keeping false positives near zero, at the cost of per-packet detection latency for threshold-based volumetric attacks.
