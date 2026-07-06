import type {
  AttackType,
  Detection,
  DetectionMethod,
  Packet,
  Severity,
  Verdict,
} from './types'

/**
 * Hybrid AI-driven detection engine.
 *
 * Layer 1 — Signature engine: explicit rules for known attack patterns
 *           (high explainability, fails on zero-day).
 * Layer 2 — ML anomaly engine: statistical model trained online on a
 *           baseline of normal traffic. Extracts a feature vector per
 *           packet + per-source behavioral window, and scores deviation
 *           (z-score based, mimicking an unsupervised anomaly detector).
 * Layer 3 — Ensemble: fuses both scores into a final verdict, mirroring
 *           the hybrid/ensemble frameworks that reduce false positives.
 */

// ---------- Signature engine ----------

const SQLI_REGEX =
  /('|%27)\s*(or|and)\s*('|%27)?1('|%27)?\s*=\s*('|%27)?1|union\s+select|drop\s+table|--\s|sleep\(\d+\)/i

interface SourceWindow {
  distinctPorts: Set<number>
  synCount: number
  failedAuth: number
  packetCount: number
  totalBytes: number
  firstSeen: number
}

interface SignatureResult {
  match: string | null
  attackType: AttackType | null
  confidence: number
}

// ---------- ML anomaly engine (online statistical model) ----------

interface FeatureStats {
  mean: number
  m2: number // for Welford variance
  n: number
}

function makeStats(): FeatureStats {
  return { mean: 0, m2: 0, n: 0 }
}

function updateStats(s: FeatureStats, x: number) {
  s.n += 1
  const delta = x - s.mean
  s.mean += delta / s.n
  s.m2 += delta * (x - s.mean)
}

function zScore(s: FeatureStats, x: number): number {
  if (s.n < 10) return 0 // still learning the baseline
  const variance = s.m2 / (s.n - 1)
  const std = Math.sqrt(Math.max(variance, 1e-6))
  return Math.abs(x - s.mean) / std
}

/** Squash a z-score into a 0..1 anomaly score. */
function squash(z: number): number {
  return 1 - Math.exp(-z / 3)
}

export class DetectionEngine {
  private windows = new Map<string, SourceWindow>()
  private blocked = new Set<string>()

  // Online baseline model: one distribution per feature
  private fBytes = makeStats()
  private fDstPort = makeStats()
  private fSrcPort = makeStats()
  private fRate = makeStats()

  private static WINDOW_MS = 5000

  isBlocked(ip: string) {
    return this.blocked.has(ip)
  }

  block(ip: string) {
    this.blocked.add(ip)
  }

  unblock(ip: string) {
    this.blocked.delete(ip)
  }

  private getWindow(ip: string): SourceWindow {
    const now = Date.now()
    let w = this.windows.get(ip)
    if (!w || now - w.firstSeen > DetectionEngine.WINDOW_MS) {
      w = {
        distinctPorts: new Set(),
        synCount: 0,
        failedAuth: 0,
        packetCount: 0,
        totalBytes: 0,
        firstSeen: now,
      }
      this.windows.set(ip, w)
    }
    return w
  }

  private runSignatures(p: Packet, w: SourceWindow): SignatureResult {
    if (SQLI_REGEX.test(p.payload)) {
      return {
        match: 'SIG-1042: SQL injection pattern in HTTP payload',
        attackType: 'SQL_INJECTION',
        confidence: 0.97,
      }
    }
    if (w.failedAuth >= 6) {
      return {
        match: `SIG-2110: ${w.failedAuth} failed auth attempts in 5s window`,
        attackType: 'BRUTE_FORCE',
        confidence: 0.93,
      }
    }
    if (w.distinctPorts.size >= 10) {
      return {
        match: `SIG-3300: ${w.distinctPorts.size} distinct ports probed in 5s window`,
        attackType: 'PORT_SCAN',
        confidence: 0.95,
      }
    }
    if (p.flags === 'SYN' && w.synCount >= 15) {
      return {
        match: `SIG-4501: SYN rate ${w.synCount}/5s exceeds flood threshold`,
        attackType: 'SYN_FLOOD',
        confidence: 0.9,
      }
    }
    if (p.bytes > 40000 && p.srcIp.startsWith('10.')) {
      return {
        match: 'SIG-5210: Abnormal outbound transfer volume from internal host',
        attackType: 'DATA_EXFILTRATION',
        confidence: 0.88,
      }
    }
    return { match: null, attackType: null, confidence: 0 }
  }

  private runAnomalyModel(p: Packet, w: SourceWindow): number {
    const rate = w.packetCount // packets from this source in current window

    const scores = [
      { z: zScore(this.fBytes, Math.log1p(p.bytes)), weight: 0.35 },
      { z: zScore(this.fDstPort, p.dstPort), weight: 0.2 },
      { z: zScore(this.fSrcPort, p.srcPort), weight: 0.15 },
      { z: zScore(this.fRate, rate), weight: 0.3 },
    ]
    const combined = scores.reduce((acc, s) => acc + squash(s.z) * s.weight, 0)

    // Extra behavioral signals the model has learned to weight highly
    const urgFlag = p.flags.includes('URG') ? 0.25 : 0
    const lowSrcPort = p.srcPort < 1024 && p.protocol === 'UDP' ? 0.2 : 0

    return Math.min(1, combined + urgFlag + lowSrcPort)
  }

  private trainOnBenign(p: Packet, w: SourceWindow) {
    updateStats(this.fBytes, Math.log1p(p.bytes))
    updateStats(this.fDstPort, p.dstPort)
    updateStats(this.fSrcPort, p.srcPort)
    updateStats(this.fRate, w.packetCount)
  }

  /** Pre-train the baseline so the demo starts with a fitted model. */
  pretrain(packets: Packet[]) {
    for (const p of packets) {
      updateStats(this.fBytes, Math.log1p(p.bytes))
      updateStats(this.fDstPort, p.dstPort)
      updateStats(this.fSrcPort, p.srcPort)
      updateStats(this.fRate, Math.floor(Math.random() * 4) + 1)
    }
  }

  get baselineSamples() {
    return this.fBytes.n
  }

  analyze(p: Packet): Detection {
    const w = this.getWindow(p.srcIp)
    w.packetCount += 1
    w.totalBytes += p.bytes
    w.distinctPorts.add(p.dstPort)
    if (p.flags === 'SYN') w.synCount += 1
    if (p.payload.includes('[FAILED]')) w.failedAuth += 1

    const sig = this.runSignatures(p, w)
    const anomalyScore = this.runAnomalyModel(p, w)

    // ---------- Ensemble fusion ----------
    const fused = Math.max(sig.confidence, anomalyScore * 0.92)

    let verdict: Verdict
    let method: DetectionMethod
    let attackType: AttackType | null = sig.attackType
    let explanation: string

    if (sig.match && anomalyScore > 0.55) {
      verdict = 'malicious'
      method = 'hybrid'
      explanation = `Signature ${sig.match.split(':')[0]} confirmed by ML anomaly score ${anomalyScore.toFixed(2)} — ensemble agreement, minimal false-positive risk.`
    } else if (sig.match) {
      verdict = 'malicious'
      method = 'signature'
      explanation = `Rule-based match: ${sig.match}.`
    } else if (anomalyScore > 0.72) {
      verdict = 'malicious'
      method = 'anomaly'
      attackType = 'ZERO_DAY'
      explanation = `No known signature, but ML model flagged feature vector as ${(anomalyScore * 100).toFixed(0)}% deviant from learned baseline (possible zero-day).`
    } else if (anomalyScore > 0.5) {
      verdict = 'suspicious'
      method = 'anomaly'
      attackType = null
      explanation = `Moderate anomaly score ${anomalyScore.toFixed(2)} — flagged for analyst review, below auto-prevention threshold.`
    } else {
      verdict = 'benign'
      method = 'hybrid'
      explanation = 'Within learned baseline; no signature match.'
      // Online learning: benign traffic continuously refines the baseline
      this.trainOnBenign(p, w)
    }

    let severity: Severity = 'low'
    if (verdict === 'malicious') {
      severity =
        fused > 0.93 ? 'critical' : fused > 0.85 ? 'high' : 'medium'
    } else if (verdict === 'suspicious') {
      severity = 'medium'
    }

    // ---------- Prevention (IPS) ----------
    let prevented = false
    if (verdict === 'malicious' && (severity === 'critical' || severity === 'high')) {
      this.block(p.srcIp)
      prevented = true
    }

    return {
      packet: p,
      verdict,
      method,
      signatureMatch: sig.match,
      anomalyScore,
      confidence: verdict === 'benign' ? 1 - anomalyScore : fused,
      severity,
      attackType,
      explanation,
      prevented,
    }
  }
}
